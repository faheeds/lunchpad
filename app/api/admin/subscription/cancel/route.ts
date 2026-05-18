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

  const restaurant = await requireRestaurant();
  const full = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
  if (!full) return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });

  if (!full.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription to cancel." }, { status: 400 });
  }

  try {
    await stripe.subscriptions.cancel(full.stripeSubscriptionId);

    await prisma.restaurant.update({
      where: { id: full.id },
      data: { subscriptionStatus: "CANCELLED" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel subscription";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
