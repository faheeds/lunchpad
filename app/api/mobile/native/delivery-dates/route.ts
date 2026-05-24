/**
 * GET /api/mobile/native/delivery-dates
 *
 * Returns all open delivery dates (regardless of weekday) with menu items.
 * Public — no auth required. Called immediately after school code entry.
 *
 * Response: DeliveryDateWithMenu[]
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function GET() {
  try {
    const restaurant = await requireRestaurant();

    const allDates = await prisma.deliveryDate.findMany({
      where: {
        orderingOpen: true,
        cutoffAt: { gt: new Date() },
        school: { isActive: true, restaurantId: restaurant.id },
      },
      include: {
        school: { select: { id: true, name: true, timezone: true, locationType: true } },
        menuAvailability: {
          where: {
            isAvailable: true,
            menuItem: { isActive: true },
          },
          include: {
            menuItem: {
              include: {
                options: { orderBy: { sortOrder: "asc" } },
                sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
              },
            },
          },
        },
        orders: {
          where: { status: "PAID", archivedAt: null },
          select: { items: { select: { menuItemId: true } } },
        },
      },
      orderBy: [{ deliveryDate: "asc" }, { school: { name: "asc" } }],
    });

    // All weekdays accepted — restaurants control delivery days by what they schedule.
    const dates = allDates;

    const result = dates.map((d) => {
      // Build sold-out set
      const countMap = new Map<string, number>();
      for (const order of d.orders) {
        for (const item of order.items) {
          countMap.set(item.menuItemId, (countMap.get(item.menuItemId) ?? 0) + 1);
        }
      }
      const soldOut = d.menuAvailability
        .filter(
          (e) =>
            e.maxQuantity !== null &&
            (countMap.get(e.menuItemId) ?? 0) >= e.maxQuantity!
        )
        .map((e) => e.menuItemId);

      return {
        id: d.id,
        schoolId: d.schoolId,
        deliveryDate: d.deliveryDate.toISOString(),
        cutoffAt: d.cutoffAt.toISOString(),
        orderingOpen: d.orderingOpen,
        school: d.school,
        soldOut,
        menuItems: d.menuAvailability.map((e) => ({
          id: e.menuItem.id,
          slug: e.menuItem.slug,
          name: e.menuItem.name,
          description: e.menuItem.description,
          imageUrl: e.menuItem.imageUrl,
          basePriceCents: e.menuItem.basePriceCents,
          // Pick-one selections the customer MUST resolve before adding
          // to cart (e.g. Beef / Chicken / Vegan). Empty array = no
          // required choice — the iOS order modal renders a picker
          // section only when this is non-empty.
          requiredChoices: e.menuItem.requiredChoices,
          // Size variants. Same picker pattern as requiredChoices but
          // the chosen size's priceCents drives the line total.
          sizes: e.menuItem.sizes.map((s) => ({
            id: s.id,
            name: s.name,
            priceCents: s.priceCents,
          })),
          options: e.menuItem.options.map((o) => ({
            id: o.id,
            name: o.name,
            optionType: o.optionType,
            priceDeltaCents: o.priceDeltaCents,
          })),
        })),
      };
    });

    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("delivery-dates error:", err);
    return NextResponse.json(
      { error: "Failed to load delivery dates" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
