import { NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * GET /api/stripe/connect/authorize[?restaurantId=xxx]
 *
 * Two entry points:
 *  1. Admin clicks "Connect Stripe account" from their subdomain settings page
 *     → requireRestaurant() resolves via subdomain header or session
 *  2. Stripe calls the refresh_url when the onboarding link expires
 *     → restaurantId is passed as a query param (no auth session needed)
 *
 * Creates a Stripe Express account for the restaurant (or reuses an existing
 * one) then redirects to a fresh Stripe-hosted onboarding link.
 */
export async function GET(request: Request) {
  if (!stripe) {
    return new Response("Stripe is not configured.", { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const restaurantIdParam = searchParams.get("restaurantId");

  // Resolve restaurant — either from the query param (refresh flow) or
  // from the logged-in admin session / subdomain (initial click).
  let restaurant: { id: string; name: string; contactEmail: string | null; stripeAccountId: string | null } | null = null;

  if (restaurantIdParam) {
    restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantIdParam },
      select: { id: true, name: true, contactEmail: true, stripeAccountId: true },
    });
  } else {
    // Standard path: admin clicked the button from their settings page
    try {
      const { requireAdmin } = await import("@/lib/admin-auth");
      const { requireRestaurant } = await import("@/lib/restaurant");
      await requireAdmin();
      const r = await requireRestaurant();
      restaurant = {
        id: r.id,
        name: r.name,
        contactEmail: r.contactEmail,
        stripeAccountId: r.stripeAccountId,
      };
    } catch {
      return new Response("Unauthorized.", { status: 401 });
    }
  }

  if (!restaurant) {
    return new Response("Restaurant not found.", { status: 404 });
  }

  const rootBase = `https://${env.ROOT_DOMAIN}`;
  const returnUrl = `${rootBase}/api/stripe/connect/return?restaurantId=${restaurant.id}`;
  const refreshUrl = `${rootBase}/api/stripe/connect/authorize?restaurantId=${restaurant.id}`;

  // Reuse an existing Express account, or create a fresh one.
  let accountId = restaurant.stripeAccountId;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: restaurant.contactEmail ?? undefined,
      business_profile: { name: restaurant.name },
      metadata: { restaurantId: restaurant.id },
    });
    accountId = account.id;

    // Persist the account ID immediately — so the refresh URL can reuse it.
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { stripeAccountId: accountId, stripeOnboardingComplete: false },
    });
  }

  // Account links are single-use and expire after a few minutes.
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });

  return NextResponse.redirect(accountLink.url);
}
