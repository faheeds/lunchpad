import { prisma } from "@/lib/db";
import type { Restaurant } from "@prisma/client";
import { getLabelsForOperator } from "@/lib/location-labels";
import {
  parseLandingContent,
  resolveLanding,
  type LandingView,
  type ResolverLocation,
} from "@/lib/landing-content";

function isoDateInTz(d: Date, tz: string): string {
  // en-CA yields yyyy-mm-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function cutoffLabel(d: Date, tz: string): string {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  return s.replace(":00", "").replace(" AM", " am").replace(" PM", " pm");
}

/** Loads everything the v2 landing page needs and resolves it into a view. */
export async function loadLandingView(restaurant: Restaurant): Promise<LandingView> {
  const now = new Date();

  const [items, schools] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      select: {
        name: true,
        slug: true,
        imageUrl: true,
        category: true,
        basePriceCents: true,
        featuredOnLanding: true,
        sortOrder: true,
        sizes: { select: { priceCents: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.school.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      select: {
        name: true,
        timezone: true,
        deliveryDates: {
          where: { cancelledAt: null, orderingOpen: true, cutoffAt: { gt: now } },
          select: { deliveryDate: true, cutoffAt: true },
          orderBy: { deliveryDate: "asc" },
          take: 8,
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const locations: ResolverLocation[] = schools.map((s) => {
    const tz = s.timezone || restaurant.timezone;
    return {
      name: s.name,
      dates: s.deliveryDates.map((d) => isoDateInTz(d.deliveryDate, tz)),
      cutoffLabel: s.deliveryDates[0] ? cutoffLabel(s.deliveryDates[0].cutoffAt, tz) : null,
    };
  });

  const placeNoun = restaurant.operatorType
    ? getLabelsForOperator(restaurant.operatorType).type.toLowerCase()
    : null;

  return resolveLanding({
    restaurantName: restaurant.name,
    placeNoun,
    heroImageUrl: restaurant.heroImageUrl,
    contactPhone: restaurant.contactPhone,
    contactEmail: restaurant.contactEmail,
    weeklyPlanningEnabled: restaurant.weeklyPlanningEnabled,
    acceptsCard: restaurant.stripeOnboardingComplete || !(restaurant.acceptCash || restaurant.acceptZelle),
    acceptsCash: restaurant.acceptCash,
    acceptsZelle: restaurant.acceptZelle,
    content: parseLandingContent(restaurant.landingContent),
    menuItems: items.map((i) => ({
      name: i.name,
      slug: i.slug,
      imageUrl: i.imageUrl,
      category: i.category,
      basePriceCents: i.basePriceCents,
      sizePricesCents: i.sizes.map((z) => z.priceCents),
      featuredOnLanding: i.featuredOnLanding,
      sortOrder: i.sortOrder,
    })),
    locations,
  });
}
