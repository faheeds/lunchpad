import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createWeeklyStripeCheckoutSession } from "@/lib/payments/checkout";
import { createWeeklyCheckoutBatch } from "@/lib/weekly-checkout";
import { assertParentApiRequest } from "@/lib/parent-auth";
import { getRequestBaseUrl } from "@/lib/request-base-url";

export async function POST(request: Request) {
  try {
    const session = await assertParentApiRequest();
    const parentUserId = session.user?.parentUserId;

    if (!parentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const batch = await createWeeklyCheckoutBatch(parentUserId);

    // Look up the restaurant's Stripe Connect account for payment routing
    const restaurantStripe = await prisma.restaurant.findUnique({
      where: { id: batch.restaurantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const stripeAccountId =
      restaurantStripe?.stripeOnboardingComplete && restaurantStripe.stripeAccountId
        ? restaurantStripe.stripeAccountId
        : null;

    // Build success/cancel URLs from the request's tenant subdomain so the
    // parent lands back on the right host after Stripe.
    const baseUrl = await getRequestBaseUrl(request);
    const stripeSession = await createWeeklyStripeCheckoutSession({
      batchId: batch.id,
      parentEmail: batch.parentUser.email,
      stripeAccountId,
      successUrl: `${baseUrl}/checkout/success?batch=${batch.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/account?cancelled=1`,
      lineItems: batch.items.map((item) => ({
        name: `${item.parentChild.studentName}: ${item.itemNameSnapshot}`,
        description: `${item.deliveryDate.school.name} - ${item.deliveryDate.deliveryDate.toISOString().slice(0, 10)}`,
        amountCents: item.lineTotalCents,
      })),
    });

    await prisma.weeklyCheckoutBatch.update({
      where: { id: batch.id },
      data: {
        checkoutSessionId: stripeSession.id
      }
    });

    return NextResponse.json({ checkoutUrl: stripeSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start weekly checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
