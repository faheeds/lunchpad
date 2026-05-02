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
  if (!slug) return null;

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug, isActive: true },
    });
    return restaurant;
  } catch {
    // Subscription migration not yet applied — fall back to selecting only legacy columns
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
});

/**
 * Like getCurrentRestaurant but throws if no restaurant is found.
 * Use in pages that require a valid tenant context.
 */
export async function requireRestaurant(): Promise<Restaurant> {
  const restaurant = await getCurrentRestaurant();
  if (!restaurant) {
    throw new Error("Restaurant not found. Check the subdomain.");
  }
  return restaurant;
}

/**
 * Returns the restaurant ID directly — convenience helper for
 * server components that only need the ID for DB queries.
 */
export async function getRestaurantId(): Promise<string | null> {
  const restaurant = await getCurrentRestaurant();
  return restaurant?.id ?? null;
}
