import { NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * GET /api/stripe/connect/return?restaurantId=xxx
 *
 * Stripe redirects here after the restaurant owner completes (or exits)
 * Express onboarding. We verify the account status directly with Stripe —
 * never trust URL params — then update the DB.
 *
 * Note: a return_url visit does NOT guarantee onboarding is complete.
 * The user may have closed the tab early. charges_enabled is the
 * authoritative signal.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get("restaurantId");
  const settingsBase = `https://${env.ROOT_DOMAIN}/admin/settings`;

  if (!restaurantId || !stripe) {
    return NextResponse.redirect(`${settingsBase}?connect_error=${encodeURIComponent("Invalid return URL.")}`);
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { stripeAccountId: true },
    });

    if (!restaurant?.stripeAccountId) {
      return NextResponse.redirect(
        `${settingsBase}?connect_error=${encodeURIComponent("No Stripe account found. Please try connecting again.")}`
      );
    }

    // Verify with Stripe directly — charges_enabled means they can accept payments.
    const account = await stripe.accounts.retrieve(restaurant.stripeAccountId);
    const complete = account.charges_enabled === true;

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeOnboardingComplete: complete },
    });

    if (complete) {
      return NextResponse.redirect(`${settingsBase}?connect_success=1`);
    } else {
      // Onboarding started but not finished — prompt them to complete it.
      return NextResponse.redirect(
        `${settingsBase}?connect_error=${encodeURIComponent(
          "Stripe account setup isn't complete yet. Click 'Connect Stripe account' to finish."
        )}`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.redirect(
      `${settingsBase}?connect_error=${encodeURIComponent(msg)}`
    );
  }
}
