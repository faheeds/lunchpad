/**
 * POST /api/mobile/native/weekly-checkout
 *
 * Mobile equivalent of /api/account/weekly-checkout. Builds a
 * WeeklyCheckoutBatch from the parent's saved WeeklyLunchPlans, generates
 * a Stripe Checkout link, and returns the URL for the iOS app to open
 * via SFSafariViewController.
 *
 * Success URL deep-links back to the iOS app at lunchpad://checkout/success
 * so the SFSafariViewController automatically dismisses on payment
 * completion (same pattern the single-order flow uses).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { createWeeklyStripeCheckoutSession } from "@/lib/payments/checkout";
import { createWeeklyCheckoutBatch } from "@/lib/weekly-checkout";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";
import { logInfo, logWarn, logException } from "@/lib/log";

export { corsOptions as OPTIONS };

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);

    logInfo("mobile_weekly_checkout_started", { parentUserId: auth.parentUserId });

    if (!stripe) {
      logWarn("mobile_weekly_checkout_stripe_not_configured");
      return NextResponse.json(
        { error: "Stripe is not configured." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const batch = await createWeeklyCheckoutBatch(auth.parentUserId);

    logInfo("mobile_weekly_checkout_batch_created", {
      parentUserId: auth.parentUserId,
      restaurantId: batch.restaurantId,
      batchId: batch.id,
      itemCount: batch.items.length,
    });

    // Stripe Connect — route the payment to the restaurant's connected
    // account if onboarded; otherwise the platform collects.
    const restaurantStripe = await prisma.restaurant.findUnique({
      where: { id: batch.restaurantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const stripeAccountId =
      restaurantStripe?.stripeOnboardingComplete && restaurantStripe.stripeAccountId
        ? restaurantStripe.stripeAccountId
        : null;

    // Success URL routes through the same /api/mobile/native/order/success
    // redirect handler that the single-order flow uses. The handler
    // accepts `orderId` (we pass batchId here) and just deep-links to
    // lunchpad://checkout/success?orderId=... — the iOS app's
    // openAuthSessionAsync result picks it up and dismisses the sheet.
    const successUrl =
      process.env.NEXTAUTH_URL +
      "/api/mobile/native/order/success?orderId=" +
      batch.id;
    const cancelUrl =
      process.env.NEXTAUTH_URL +
      "/api/mobile/native/order/cancel?orderId=" +
      batch.id;

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

    logInfo("mobile_weekly_checkout_session_created", {
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
    logException(err, "mobile_weekly_checkout_creation_failed");
    const status = (err as { status?: number }).status ?? 400;
    const message = err instanceof Error ? err.message : "Unable to start weekly checkout";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
