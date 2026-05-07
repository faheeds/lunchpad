import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { stripe } from "@/lib/payments/stripe";
import { env } from "@/lib/env";
import { sendSubscriptionChangedEmail } from "@/lib/email/service";

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

  // ── Plan switch path ────────────────────────────────────────────────────
  // If the restaurant already has an active Stripe subscription, update the
  // existing subscription's price item rather than creating a new subscription.
  // Stripe handles proration automatically. This avoids double-charging the
  // customer (which would happen if we created a parallel subscription).
  if (full.stripeSubscriptionId && full.subscriptionStatus === "ACTIVE") {
    try {
      const existing = await stripe.subscriptions.retrieve(full.stripeSubscriptionId);
      const itemId = existing.items.data[0]?.id;
      if (!itemId) {
        return NextResponse.json({ error: "Existing subscription has no items to update." }, { status: 500 });
      }
      await stripe.subscriptions.update(full.stripeSubscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { checkoutType: "subscription", restaurantId: full.id, plan: body.plan },
      });
      // Update Restaurant immediately — no webhook round-trip needed for in-place switch.
      const oldPlan = full.plan;
      await prisma.restaurant.update({
        where: { id: full.id },
        data: { plan: body.plan as "STARTER" | "GROWTH" | "SCALE" },
      });
      // Best-effort confirmation email with proration details. Never block on it.
      sendSubscriptionChangedEmail(full.id, oldPlan, body.plan).catch(() => {});
      // No Stripe Checkout redirect — return a direct URL the client navigates to.
      return NextResponse.json({ url: `${env.APP_BASE_URL}/admin/subscription?success=1` });
    } catch (err) {
      // If the stored subscription ID is stale/cancelled in Stripe, fall through
      // to the regular new-subscription path below.
      const message = err instanceof Error ? err.message : "Subscription update failed.";
      // Only fall through for "not found" errors; surface anything else.
      if (!/No such subscription|resource_missing/i.test(message)) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      // Fall through to checkout below.
    }
  }

  // ── First-time / lapsed subscription path ───────────────────────────────
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
