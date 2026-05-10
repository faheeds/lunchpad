import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";

export async function requireParent() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "PARENT" || !session.user.parentUserId) {
    redirect("/account/sign-in");
  }
  // Per-tenant session check: a parent signed in at Restaurant A cannot
  // operate on Restaurant B with the same session. The cookie domain is
  // .lunchpad.us so it travels across subdomains, but each tenant has
  // its own ParentUser record — so if the session's parentRestaurantId
  // doesn't match the current tenant, force a fresh sign-in here.
  // Without this, navigating between tenants would silently surface the
  // previous tenant's children/orders/restaurant URL.
  const currentRestaurant = await getCurrentRestaurant();
  if (
    currentRestaurant &&
    session.user.parentRestaurantId &&
    session.user.parentRestaurantId !== currentRestaurant.id
  ) {
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
  // so we re-verify here.
  const currentRestaurant = await getCurrentRestaurant();
  if (
    currentRestaurant &&
    session.user.parentRestaurantId &&
    session.user.parentRestaurantId !== currentRestaurant.id
  ) {
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
