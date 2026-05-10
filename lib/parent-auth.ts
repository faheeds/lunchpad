import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";

export async function requireParent() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "PARENT" || !session.user.parentUserId) {
    redirect("/account/sign-in");
  }
  // Per-tenant session check. The cookie is domain-scoped to .lunchpad.us
  // so it travels across subdomains, but each tenant has its own
  // ParentUser record — the session must be matched against the current
  // tenant.
  //
  // Two cases we treat the same way (force re-auth):
  //   1. parentRestaurantId is set and doesn't match — the user is on a
  //      different tenant than the one they signed into.
  //   2. parentRestaurantId is missing entirely — pre-migration session
  //      that JWT hydration couldn't recover (orphan parent record, etc.)
  //      We can't trust this session against the current tenant, so it
  //      lands on sign-in with the same banner.
  const currentRestaurant = await getCurrentRestaurant();
  if (currentRestaurant && session.user.parentRestaurantId !== currentRestaurant.id) {
    redirect("/account/sign-in?different-tenant=1");
  }
  return session;
}

export async function assertParentApiRequest() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "PARENT" || !session.user.parentUserId) {
    throw new Error("Unauthorized");
  }
  // Same per-tenant check as requireParent — API routes can be called
  // from a different subdomain than the one the session was issued for,
  // so we re-verify here. Treat missing parentRestaurantId the same as
  // a mismatch (pre-migration session that couldn't be hydrated).
  const currentRestaurant = await getCurrentRestaurant();
  if (currentRestaurant && session.user.parentRestaurantId !== currentRestaurant.id) {
    throw new Error("Session is for a different restaurant. Sign in here to continue.");
  }
  return session;
}

/**
 * Resolve the tenant restaurant for a parent-facing page.
 *
 * The parent session cookie is scoped to `.lunchpad.us`, so a parent
 * who signed in on `shake-shack.lunchpad.us` will still carry their
 * session to the apex `lunchpad.us`. On the apex there's no slug
 * header, so `getCurrentRestaurant()` returns null — and any page that
 * blindly calls `requireRestaurant()` would throw with "Restaurant not
 * found" because parents don't carry `restaurantId` on the session.
 *
 * This helper resolves the parent's "home" restaurant via their
 * children's school (or most recent order) and 302s them to the right
 * subdomain. Returns the resolved Restaurant when we're already on a
 * tenant subdomain so callers can use it directly.
 *
 * Pass the path to redirect to on the resolved subdomain (default: the
 * caller's pathname).
 */
export async function requireParentTenant(parentUserId: string, redirectPath = "/account") {
  const restaurant = await getCurrentRestaurant();
  if (restaurant) return restaurant;

  // Apex path — read the parent's home restaurant directly. Parents are
  // scoped per-tenant so this is now a direct lookup; no need to walk
  // through children/orders.
  const parent = await prisma.parentUser.findUnique({
    where: { id: parentUserId },
    include: { restaurant: true },
  });

  if (parent?.restaurant) {
    const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";
    redirect(`https://${parent.restaurant.slug}.${rootDomain}${redirectPath}`);
  }

  // Orphan parent (shouldn't happen with the new schema) — dead-end at sign-in.
  redirect("/account/sign-in");
}
