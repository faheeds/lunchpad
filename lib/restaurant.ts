import { headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { Restaurant } from "@prisma/client";

/**
 * Returns the current restaurant based on the subdomain in the request.
 * Cached per request via React's cache() — only one DB hit per page render.
 * Returns null if no restaurant slug is present (e.g. platform landing page).
 */
export const getCurrentRestaurant = cache(async (): Promise<Restaurant | null> => {
  const headerList = await headers();
  const slug = headerList.get("x-restaurant-slug");
  const customDomain = headerList.get("x-custom-domain");

  // 1. Slug-based lookup (subdomain routing — primary path)
  if (slug) {
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug, isActive: true },
      });
      return restaurant;
    } catch {
      // Column migration not yet applied — fall back to raw query with only known columns.
      // NOTE: do NOT include "customDomain" here until the migration has been deployed.
      const rows = await prisma.$queryRaw<Restaurant[]>`
        SELECT id, name, slug, timezone, "logoUrl", "primaryColor", "accentColor",
               "darkColor", "heroImageUrl", "heroTitleColor", "heroAccentColor",
               "bodyTextColor", "displayFont", "bodyFont", "contactEmail", "contactPhone",
               "isActive", "stripeAccountId", "stripeOnboardingComplete",
               plan, "trialEndsAt", "createdAt", "updatedAt"
        FROM "Restaurant"
        WHERE slug = ${slug} AND "isActive" = true
        LIMIT 1
      `;
      return rows[0] ?? null;
    }
  }

  // 2. Custom domain lookup (e.g. lunch.example.com)
  if (customDomain) {
    try {
      const restaurant = await prisma.restaurant.findFirst({
        where: { customDomain, isActive: true },
      });
      return restaurant;
    } catch {
      // Column may not exist yet on older DB — ignore
    }
  }

  return null;
});

/**
 * Like getCurrentRestaurant but throws if no restaurant is found.
 * Use in pages that require a valid tenant context.
 */
export async function requireRestaurant(): Promise<Restaurant> {
  // 1. Try subdomain-based resolution first
  const restaurant = await getCurrentRestaurant();
  if (restaurant) return restaurant;

  // 2. No subdomain header — fall back to the logged-in admin's restaurantId.
  //    This lets /admin/* pages work on the root Vercel URL or any domain
  //    without subdomain routing (e.g. lunchpad-five.vercel.app/admin/dashboard).
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    const restaurantId = (session?.user as { restaurantId?: string } | undefined)?.restaurantId;
    if (restaurantId) {
      try {
        const fromSession = await prisma.restaurant.findUnique({ where: { id: restaurantId, isActive: true } });
        if (fromSession) return fromSession;
      } catch {
        // Column migration not yet applied — raw fallback
        const rows = await prisma.$queryRaw<Restaurant[]>`
          SELECT id, name, slug, timezone, "logoUrl", "primaryColor", "accentColor",
                 "darkColor", "heroImageUrl", "heroTitleColor", "heroAccentColor",
                 "bodyTextColor", "displayFont", "bodyFont", "contactEmail", "contactPhone",
                 "isActive", "stripeAccountId", "stripeOnboardingComplete",
                 plan, "trialEndsAt", "createdAt", "updatedAt"
          FROM "Restaurant"
          WHERE id = ${restaurantId} AND "isActive" = true
          LIMIT 1
        `;
        if (rows[0]) return rows[0];
      }
    }
  } catch {
    // auth not available — fall through to error
  }

  throw new Error("Restaurant not found. Check the subdomain.");
}

/**
 * Returns the restaurant ID directly — convenience helper for
 * server components that only need the ID for DB queries.
 */
export async function getRestaurantId(): Promise<string | null> {
  const restaurant = await getCurrentRestaurant();
  return restaurant?.id ?? null;
}
