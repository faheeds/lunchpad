/**
 * GET /api/mobile/native/menu
 *
 * Returns the full active menu for the current restaurant, grouped by
 * category. Public — no auth required. Used by the iOS app's Menu tab
 * so customers can browse what's on offer without committing to a date.
 *
 * Differs from /delivery-dates in two ways:
 *   - Not scoped to a specific delivery date; returns the whole menu
 *   - Includes dietary tags and category for richer browsing
 *
 * The shape pairs categories with their items so the iOS app can render
 * section lists without re-grouping on the client.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function GET() {
  try {
    const restaurant = await requireRestaurant();

    const items = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      include: {
        options: { orderBy: { sortOrder: "asc" } },
        sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
      orderBy: [
        { category: "asc" },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    // Group by category for the iOS section list. Items with no category
    // land in a single "Other" bucket so they still render.
    const grouped = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.category ?? "Other";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }

    const categories = Array.from(grouped.entries()).map(([title, list]) => ({
      title,
      items: list.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        basePriceCents: item.basePriceCents,
        dietaryTags: item.dietaryTags,
        // Pick-one selections the customer MUST resolve before adding
        // the item to their cart (e.g. Beef / Chicken / Vegan for a
        // Build-Your-Own Burger). Empty array = no required choice.
        requiredChoices: item.requiredChoices,
        // Size variants with absolute per-size prices. When non-empty
        // the iOS order modal renders a size picker and uses the
        // selected size's priceCents as the line's base price. Empty
        // = single-price item; basePriceCents is canonical.
        sizes: item.sizes.map((s) => ({
          id: s.id,
          name: s.name,
          priceCents: s.priceCents,
        })),
        options: item.options.map((o) => ({
          id: o.id,
          name: o.name,
          optionType: o.optionType,
          priceDeltaCents: o.priceDeltaCents,
        })),
      })),
    }));

    return NextResponse.json(
      { restaurantName: restaurant.name, categories },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[mobile/menu] error:", err);
    return NextResponse.json(
      { error: "Failed to load menu" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
