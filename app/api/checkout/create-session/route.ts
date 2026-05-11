import { NextResponse } from "next/server";
import { orderFormSchema } from "@/lib/validation/order";
import { createPendingOrder } from "@/lib/orders";
import { createStripeCheckoutSession } from "@/lib/payments/checkout";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { auth } from "@/lib/auth";
import { getRequestBaseUrl } from "@/lib/request-base-url";

export async function POST(request: Request) {
  try {
    const authSession = await auth();
    const body = await request.json();
    const parsed = orderFormSchema.parse(body);

    // Rate-limit: block if the same parent already has a PENDING order for this
    // delivery date created in the last 5 minutes (prevents accidental double-orders)
    const parentUserId =
      authSession?.user?.role === "PARENT" ? authSession.user.parentUserId : undefined;
    if (parentUserId) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const duplicate = await prisma.order.findFirst({
        where: {
          parentUserId,
          deliveryDateId: parsed.deliveryDateId,
          status: "PENDING",
          createdAt: { gte: fiveMinutesAgo },
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "You already have a pending order for this date. Complete or cancel it before placing another." },
          { status: 429 }
        );
      }
    }

    const provisionalOrder = await createPendingOrder(
      parsed,
      undefined,
      authSession?.user?.role === "PARENT" ? authSession.user.parentUserId : undefined
    );

    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured. Add STRIPE_SECRET_KEY before testing checkout." },
        { status: 500 }
      );
    }

    // Look up the restaurant's Stripe Connect account so payments are routed
    // directly to the restaurant (LunchPad retains a platform fee).
    const restaurantStripe = await prisma.restaurant.findUnique({
      where: { id: provisionalOrder.restaurantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const stripeAccountId =
      restaurantStripe?.stripeOnboardingComplete && restaurantStripe.stripeAccountId
        ? restaurantStripe.stripeAccountId
        : null;

    // If createPendingOrder applied a discount, surface it on the Stripe
    // Checkout page as a proper coupon line so the customer sees what's
    // happening (and Stripe's receipt itemizes it correctly too).
    // We look up the redemption to grab the display name — same one the
    // operator set in the admin builder.
    const redemption = provisionalOrder.discountCents > 0
      ? await prisma.discountRedemption.findUnique({
          where: { orderId: provisionalOrder.id },
          include: { discount: { select: { name: true } } },
        })
      : null;

    // Build success/cancel URLs from the request's actual host so customers
    // come back to the same tenant subdomain (or custom domain) after Stripe
    // Checkout instead of getting bounced to the apex.
    const baseUrl = await getRequestBaseUrl(request);
    const session = await createStripeCheckoutSession({
      orderId: provisionalOrder.id,
      orderNumber: provisionalOrder.orderNumber,
      parentEmail: provisionalOrder.parentEmail,
      stripeAccountId,
      successUrl: `${baseUrl}/checkout/success?order=${provisionalOrder.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/order?cancelled=1`,
      lineItems: provisionalOrder.items.map((item) => ({
        name: `School lunch preorder: ${item.itemNameSnapshot}`,
        description: `Order ${provisionalOrder.orderNumber}`,
        amountCents: item.lineTotalCents,
      })),
      discountCents: provisionalOrder.discountCents,
      discountLabel: redemption?.discount.name,
    });

    await prisma.order.update({
      where: { id: provisionalOrder.id },
      data: {
        checkoutSessionId: session.id,
        payment: {
          update: {
            providerSessionId: session.id
          }
        }
      }
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create checkout session.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
