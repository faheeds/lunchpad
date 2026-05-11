/**
 * POST /api/mobile/native/order
 *
 * Creates a pending order and returns a Stripe Checkout URL.
 * The React Native app opens this URL in the browser for payment,
 * then deep-links back to lunchpad://checkout/success or /cancel.
 *
 * Auth: Bearer JWT (optional - guest checkout still works)
 *
 * Body: {
 *   deliveryDateId: string
 *   schoolId: string
 *   studentName: string
 *   grade: string
 *   parentName: string
 *   parentEmail: string
 *   allergyNotes?: string
 *   specialInstructions?: string
 *   items: {
 *     menuItemId: string
 *     additions?: string[]
 *     removals?: string[]
 *   }[]
 * }
 *
 * Response: { checkoutUrl: string, orderId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPendingOrder } from "@/lib/orders";
import { createStripeCheckoutSession } from "@/lib/payments/checkout";
import { stripe } from "@/lib/payments/stripe";
import { requireRestaurant } from "@/lib/restaurant";
import { getMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function POST(request: NextRequest) {
  try {
    const restaurant = await requireRestaurant();
    const mobileAuth = await getMobileAuth(request);
    const parentUserId = mobileAuth?.parentUserId;

    const body = await request.json();

    // Basic validation
    if (!body.deliveryDateId || !body.schoolId || !body.studentName || !body.parentEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Duplicate order guard (same parent, same date, PENDING in last 5 min)
    if (parentUserId) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const duplicate = await prisma.order.findFirst({
        where: {
          parentUserId,
          deliveryDateId: body.deliveryDateId,
          status: "PENDING",
          createdAt: { gte: fiveMinutesAgo },
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "You already have a pending order for this date." },
          { status: 429, headers: CORS_HEADERS }
        );
      }
    }

    // Map mobile "items" array to internal "cartItems" shape. `choice`
    // is the optional pick-one required-choice value the customer
    // selected in the iOS app's item modal (mirrors the web order form's
    // CartItem.choice). For items without required choices it's just
    // omitted; createPendingOrder validates it against menuItem.requiredChoices.
    const cartItems = (body.items ?? []).map(
      (i: { menuItemId: string; choice?: string; additions?: string[]; removals?: string[] }) => ({
        menuItemId: i.menuItemId,
        choice: i.choice,
        additions: i.additions ?? [],
        removals: i.removals ?? [],
      })
    );

    const provisionalOrder = await createPendingOrder(
      {
        deliveryDateId: body.deliveryDateId,
        schoolId: body.schoolId,
        studentName: body.studentName,
        grade: body.grade ?? "",
        parentName: body.parentName,
        parentEmail: body.parentEmail.toLowerCase(),
        allergyNotes: body.allergyNotes ?? "",
        specialInstructions: body.specialInstructions ?? "",
        cartItems,
      },
      undefined,
      parentUserId
    );

    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const restaurantStripe = await prisma.restaurant.findUnique({
      where: { id: restaurant.id },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const stripeAccountId =
      restaurantStripe?.stripeOnboardingComplete && restaurantStripe.stripeAccountId
        ? restaurantStripe.stripeAccountId
        : null;

    const successUrl = process.env.NEXTAUTH_URL + "/api/mobile/native/order/success?orderId=" + provisionalOrder.id;
    const cancelUrl = process.env.NEXTAUTH_URL + "/api/mobile/native/order/cancel?orderId=" + provisionalOrder.id;

    const session = await createStripeCheckoutSession({
      orderId: provisionalOrder.id,
      orderNumber: provisionalOrder.orderNumber,
      parentEmail: provisionalOrder.parentEmail,
      stripeAccountId,
      successUrl,
      cancelUrl,
      lineItems: provisionalOrder.items.map((item) => ({
        name: "School lunch: " + item.itemNameSnapshot,
        description: "Order " + provisionalOrder.orderNumber,
        amountCents: item.lineTotalCents,
      })),
    });

    await prisma.order.update({
      where: { id: provisionalOrder.id },
      data: {
        checkoutSessionId: session.id,
        payment: { update: { providerSessionId: session.id } },
      },
    });

    return NextResponse.json(
      { checkoutUrl: session.url, orderId: provisionalOrder.id },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create order";
    console.error("Native order error:", err);
    return NextResponse.json(
      { error: message },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}
