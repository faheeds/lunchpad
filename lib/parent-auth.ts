import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";

export async function requireParent() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "PARENT" || !session.user.parentUserId) {
    redirect("/account/sign-in");
  }
  return session;
}

export async function assertParentApiRequest() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "PARENT" || !session.user.parentUserId) {
    throw new Error("Unauthorized");
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

  // Apex path — find the parent's restaurant and bounce.
  const child = await prisma.parentChild.findFirst({
    where: { parentUserId, archivedAt: null },
    include: { school: { include: { restaurant: true } } },
    orderBy: { createdAt: "asc" },
  });
  let resolvedSlug = child?.school.restaurant?.slug;

  if (!resolvedSlug) {
    const lastOrder = await prisma.order.findFirst({
      where: { parentUserId },
      include: { restaurant: true },
      orderBy: { createdAt: "desc" },
    });
    resolvedSlug = lastOrder?.restaurant?.slug ?? undefined;
  }

  if (resolvedSlug) {
    const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";
    redirect(`https://${resolvedSlug}.${rootDomain}${redirectPath}`);
  }

  // Parent has no children + no orders — send them to sign-in instead of
  // throwing. This shouldn't happen in practice but it's the safest dead-end.
  redirect("/account/sign-in");
}
