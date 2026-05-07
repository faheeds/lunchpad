import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { stripe } from "@/lib/payments/stripe";
import { env } from "@/lib/env";

const PRICE_MAP: Record<string, string | undefined> = {
  STARTER: env.STRIPE_PRICE_STARTER,
  GROWTH:  env.STRIPE_PRICE_GROWTH,
  SCALE:   env.STRIPE_PRICE_SCALE,
};

export async function POST(request: Request) {
  try {
    await assertAdminApiRequest("OWNER");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  let body: { plan: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const priceId = PRICE_MAP[body.plan];
  if (!priceId) {
    return NextResponse.json({ error: "Invalid plan or price not configured." }, { status: 400 });
  }

  const restaurant = await requireRestaurant();
  const full = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
  if (!full) return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });

  // Reuse or create Stripe customer
  let customerId = full.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: full.contactEmail ?? undefined,
      name: full.name,
      metadata: { restaurantId: full.id },
    });
    customerId = customer.id;
    await prisma.restaurant.update({
      where: { id: full.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.APP_BASE_URL}/admin/subscription?success=1`,
    cancel_url: `${env.APP_BASE_URL}/admin/subscription`,
    metadata: { checkoutType: "subscription", restaurantId: full.id, plan: body.plan },
    subscription_data: {
      metadata: { checkoutType: "subscription", restaurantId: full.id, plan: body.plan },
    },
  });

  return NextResponse.json({ url: session.url });
}
