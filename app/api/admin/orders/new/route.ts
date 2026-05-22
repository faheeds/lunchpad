/**
 * Admin "manual order creation" endpoint.
 *
 * Accepts the same shape as the customer order form, plus a `paymentMode`
 * discriminator. Auth: any admin role can create orders, but `comped` and
 * `manual` payment modes are restricted to MANAGER+ because they bypass
 * the Stripe revenue path. STAFF can still send a Stripe Checkout link
 * (the customer pays normally; STAFF just helped place the order).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { createAdminOrder } from "@/lib/orders";
import { createStripeCheckoutSession } from "@/lib/payments/checkout";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { getRequestBaseUrl } from "@/lib/request-base-url";
import { logInfo, logWarn, logException } from "@/lib/log";

const paymentModeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stripe_link") }),
  z.object({
    kind: z.literal("manual"),
    method: z.string().min(1),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    kind: z.literal("comped"),
    reason: z.string().optional(),
  }),
]);

const cartItemSchema = z.object({
  menuItemId: z.string().min(1),
  choice: z.string().optional(),
  additions: z.array(z.string()).default([]),
  removals: z.array(z.string()).default([]),
});

const bodySchema = z.object({
  parentName: z.string().min(2),
  parentEmail: z.string().email(),
  schoolId: z.string().min(1),
  deliveryDateId: z.string().min(1),
  studentName: z.string().min(2),
  grade: z.string().optional(),
  teacherName: z.string().optional(),
  classroom: z.string().optional(),
  allergyNotes: z.string().optional(),
  specialInstructions: z.string().optional(),
  cartItems: z.array(cartItemSchema).min(1, "Add at least one item."),
  paymentMode: paymentModeSchema,
});

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let restaurantId: string;
  let adminUserId: string;
  try {
    ({ restaurantId, adminUserId } = await assertAdminApiRequest("STAFF"));
  } catch (err) {
    logWarn("admin_order_unauthorized");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 },
    );
  }

  logInfo("admin_order_creation_started", { restaurantId, adminUserId });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    logWarn("admin_order_validation_failed", { restaurantId });
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid request."
        : "Invalid request body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Role gating for the bypass-Stripe payment modes. STAFF is allowed to
  // generate a Stripe Checkout link (customer still pays normally), but
  // recording a manual payment or comping an order are MANAGER+ ops
  // because they sidestep the revenue ledger Stripe maintains.
  if (parsed.paymentMode.kind === "manual" || parsed.paymentMode.kind === "comped") {
    try {
      await assertAdminApiRequest("MANAGER");
    } catch {
      logWarn("admin_order_insufficient_role", {
        restaurantId,
        attemptedPaymentMode: parsed.paymentMode.kind,
      });
      return NextResponse.json(
        { error: `Only managers and owners can ${parsed.paymentMode.kind === "comped" ? "comp orders" : "record manual payments"}.` },
        { status: 403 },
      );
    }
  }

  let order;
  try {
    order = await createAdminOrder({
      input: {
        parentName: parsed.parentName,
        parentEmail: parsed.parentEmail,
        schoolId: parsed.schoolId,
        deliveryDateId: parsed.deliveryDateId,
        studentName: parsed.studentName,
        grade: parsed.grade ?? "",
        teacherName: parsed.teacherName,
        classroom: parsed.classroom,
        allergyNotes: parsed.allergyNotes,
        specialInstructions: parsed.specialInstructions,
        cartItems: parsed.cartItems,
      },
      paymentMode: parsed.paymentMode,
      restaurantId,
      adminUserId,
    });

    logInfo("admin_order_created", {
      restaurantId,
      adminUserId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentMode: parsed.paymentMode.kind,
      amountCents: order.totalCents,
    });
  } catch (err) {
    logException(err, "admin_order_creation_failed", { restaurantId, adminUserId });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create order." },
      { status: 400 },
    );
  }

  // Branch on payment mode for the post-create work:
  //
  //   stripe_link  — generate a Stripe Checkout URL the admin can copy or
  //                  forward. We don't email the parent automatically; the
  //                  admin decides whether to share the link via SMS, paste
  //                  it in their reply email, etc.
  //   manual       — order is already PAID. Send the standard confirmation
  //                  email so the customer has a receipt.
  //   comped       — order is already PAID. Send the standard confirmation
  //                  so the customer knows what was ordered for them.
  let checkoutUrl: string | null = null;
  if (parsed.paymentMode.kind === "stripe_link") {
    if (!stripe) {
      logWarn("admin_order_stripe_not_configured", { restaurantId });
      return NextResponse.json(
        { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to use the checkout-link mode." },
        { status: 500 },
      );
    }
    const restaurantStripe = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const stripeAccountId =
      restaurantStripe?.stripeOnboardingComplete && restaurantStripe.stripeAccountId
        ? restaurantStripe.stripeAccountId
        : null;
    const baseUrl = await getRequestBaseUrl();
    const session = await createStripeCheckoutSession({
      orderId: order.id,
      orderNumber: order.orderNumber,
      parentEmail: order.parentEmail,
      stripeAccountId,
      successUrl: `${baseUrl}/checkout/success?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/order?cancelled=1`,
      lineItems: order.items.map((item) => ({
        name: `School lunch preorder: ${item.itemNameSnapshot}`,
        description: `Order ${order.orderNumber}`,
        amountCents: item.lineTotalCents,
      })),
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        checkoutSessionId: session.id,
        payment: { update: { providerSessionId: session.id } },
      },
    });

    logInfo("admin_order_checkout_session_created", {
      restaurantId,
      orderId: order.id,
      sessionId: session.id,
    });

    checkoutUrl = session.url ?? null;
  } else {
    // PAID immediately (manual / comped) — email the receipt. Best-effort:
    // a failed email shouldn't roll back an order that's already in the DB
    // and on the kitchen sheet.
    try {
      await sendOrderConfirmationEmail(order.id, restaurantId);
      logInfo("admin_order_confirmation_email_sent", {
        restaurantId,
        orderId: order.id,
        paymentMode: parsed.paymentMode.kind,
      });
    } catch (e) {
      logWarn("admin_order_confirmation_email_failed", {
        restaurantId,
        orderId: order.id,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    checkoutUrl,
    paymentMode: parsed.paymentMode.kind,
  });
}
