import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { stripe } from "@/lib/payments/stripe";

export async function POST(request: Request) {
  try {
    await assertAdminApiRequest("OWNER");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  try {
    const restaurant = await requireRestaurant();

    if (!restaurant.stripeSubscriptionId) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    // Cancel the Stripe subscription at period end (don't immediately cancel)
    await stripe.subscriptions.update(restaurant.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update the database to mark subscription as cancelled
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { subscriptionStatus: "CANCELLED" },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Cancel subscription error:", error);
    const message = error instanceof Error ? error.message : "Failed to cancel subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
