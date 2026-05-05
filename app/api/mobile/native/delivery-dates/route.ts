/**
 * GET /api/mobile/native/delivery-dates
 *
 * Returns open delivery dates (Mon–Thu only) with menu items for each date.
 * Public — no auth required. Called immediately after school code entry.
 *
 * Response: DeliveryDateWithMenu[]
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

function getWeekday(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const day = fmt.format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

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
        school: { select: { id: true, name: true, timezone: true } },
        menuAvailability: {
          where: {
            isAvailable: true,
            menuItem: { isActive: true },
          },
          include: {
            menuItem: {
              include: {
                options: { orderBy: { sortOrder: "asc" } },
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

    // Filter Mon–Thu
    const dates = allDates.filter((d) => {
      const wd = getWeekday(d.deliveryDate, d.school.timezone);
      return wd >= 1 && wd <= 4;
    });

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
