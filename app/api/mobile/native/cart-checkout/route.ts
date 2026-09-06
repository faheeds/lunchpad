/**
 * POST /api/mobile/native/cart-checkout
 *
 * Ad-hoc equivalent of /api/mobile/native/weekly-checkout: builds a
 * WeeklyCheckoutBatch from a cart submitted live by the app (as opposed
 * to reading pre-saved WeeklyLunchPlan rows), one payment, one item per
 * checkout-line, each independently attributable to any child — this is
 * what lets a single day's cart have different items for different
 * children in one checkout instead of forcing one eater for the whole
 * cart.
 *
 * Reuses the exact same downstream payment/webhook path as weekly
 * checkout (createWeeklyStripeCheckoutSession, markWeeklyBatchPaidByCheckoutSession)
 * unchanged — only createAdHocCheckoutBatch (lib/weekly-checkout.ts) is
 * new, and its only job is validating the submitted cart with the same
 * rigor the weekly version already applies to server-read data.
 *
 * Body: {
 *   deliveryDateId: string
 *   items: {
 *     parentChildId: string
 *     menuItemId: string
 *     choice?: string
 *     size?: string
 *     additions?: string[]
 *     removals?: string[]
 *   }[]
 * }
 *
 * Response: { checkoutUrl: string, batchId: string, totalCents: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { createWeeklyStripeCheckoutSession } from "@/lib/payments/checkout";
import { createAdHocCheckoutBatch } from "@/lib/weekly-checkout";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";
import { logInfo, logWarn, logException } from "@/lib/log";

export { corsOptions as OPTIONS };

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);

    logInfo("mobile_cart_checkout_started", { parentUserId: auth.parentUserId });

    if (!stripe) {
      logWarn("mobile_cart_checkout_stripe_not_configured");
      return NextResponse.json(
        { error: "Stripe is not configured." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();
    const deliveryDateId = body?.deliveryDateId;
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!deliveryDateId || items.length === 0) {
      logWarn("mobile_cart_checkout_missing_fields", { parentUserId: auth.parentUserId });
      return NextResponse.json(
        { error: "Missing delivery date or cart items." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cartItems = items.map((item: Record<string, unknown>) => ({
      parentChildId: String(item.parentChildId ?? ""),
      menuItemId: String(item.menuItemId ?? ""),
      choice: item.choice ? String(item.choice) : null,
      size: item.size ? String(item.size) : null,
      additions: Array.isArray(item.additions) ? item.additions.map(String) : [],
      removals: Array.isArray(item.removals) ? item.removals.map(String) : [],
    }));

    const batch = await createAdHocCheckoutBatch(auth.parentUserId, String(deliveryDateId), cartItems);

    logInfo("mobile_cart_checkout_batch_created", {
      parentUserId: auth.parentUserId,
      restaurantId: batch.restaurantId,
      batchId: batch.id,
      itemCount: batch.items.length,
    });

    const restaurantStripe = await prisma.restaurant.findUnique({
      where: { id: batch.restaurantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const stripeAccountId =
      restaurantStripe?.stripeOnboardingComplete && restaurantStripe.stripeAccountId
        ? restaurantStripe.stripeAccountId
        : null;

    // Same success/cancel redirect handlers the weekly-checkout and
    // single-order flows already use — the handler accepts any id under
    // `orderId` and deep-links back into the app the same way regardless
    // of whether it's a single order or a batch.
    const successUrl =
      process.env.NEXTAUTH_URL + "/api/mobile/native/order/success?orderId=" + batch.id;
    const cancelUrl =
      process.env.NEXTAUTH_URL + "/api/mobile/native/order/cancel?orderId=" + batch.id;

    const stripeSession = await createWeeklyStripeCheckoutSession({
      batchId: batch.id,
      parentEmail: batch.parentUser.email,
      stripeAccountId,
      successUrl,
      cancelUrl,
      lineItems: batch.items.map((item) => ({
        name: `${item.parentChild.studentName}: ${item.itemNameSnapshot}`,
        description: `${item.deliveryDate.school.name} — ${item.deliveryDate.deliveryDate
          .toISOString()
          .slice(0, 10)}`,
        amountCents: item.lineTotalCents,
      })),
    });

    await prisma.weeklyCheckoutBatch.update({
      where: { id: batch.id },
      data: { checkoutSessionId: stripeSession.id },
    });

    logInfo("mobile_cart_checkout_session_created", {
      parentUserId: auth.parentUserId,
      restaurantId: batch.restaurantId,
      batchId: batch.id,
      sessionId: stripeSession.id,
    });

    return NextResponse.json(
      {
        checkoutUrl: stripeSession.url,
        batchId: batch.id,
        totalCents: batch.totalCents,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    logException(err, "mobile_cart_checkout_creation_failed");
    const status = (err as { status?: number }).status ?? 400;
    const message = err instanceof Error ? err.message : "Unable to start checkout";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
