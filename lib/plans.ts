/**
 * Single source of truth for plan tiers and their limits.
 *
 * Server actions that create tenant-scoped resources (locations, team
 * members, etc.) should call assertWithinPlan(restaurantId, "locations")
 * before mutating. The subscription page also imports PLAN_LIMITS to render
 * the usage meter.
 */

import type { RestaurantPlan } from "@prisma/client";

export type PlanLimits = {
  /** Display name. */
  label: string;
  /** Public price string. */
  price: string;
  /** Number monthly USD. Used for sort order, comparisons, etc. */
  priceMonthly: number;
  /** Marketing one-liner. */
  description: string;
  /** Max active locations. null = unlimited. */
  maxLocations: number | null;
  /** Max admin team seats. null = unlimited. */
  maxTeamSeats: number | null;
  /** Max paid orders per calendar month. null = unlimited. */
  maxOrdersPerMonth: number | null;
};

export const PLAN_LIMITS: Record<RestaurantPlan, PlanLimits> = {
  FREE: {
    label: "Free trial",
    price: "$0",
    priceMonthly: 0,
    description: "14-day trial. All features unlocked.",
    maxLocations: 1,
    maxTeamSeats: 2,
    maxOrdersPerMonth: 50,
  },
  STARTER: {
    label: "Starter",
    price: "$49/mo",
    priceMonthly: 49,
    description: "One school or office. Perfect to get started.",
    maxLocations: 1,
    maxTeamSeats: 3,
    maxOrdersPerMonth: 500,
  },
  GROWTH: {
    label: "Growth",
    price: "$149/mo",
    priceMonthly: 149,
    description: "Up to 5 locations. Most popular.",
    maxLocations: 5,
    maxTeamSeats: 10,
    maxOrdersPerMonth: 5000,
  },
  SCALE: {
    label: "Scale",
    price: "$349/mo",
    priceMonthly: 349,
    description: "Unlimited everything. For multi-site operators.",
    maxLocations: null,
    maxTeamSeats: null,
    maxOrdersPerMonth: null,
  },
};

export type PlanResource = "locations" | "teamSeats" | "ordersThisMonth";

/**
 * Throws a friendly Error if the restaurant has hit the configured limit
 * for the given resource. The message is suitable to surface to admins.
 */
export class PlanLimitError extends Error {
  constructor(
    public readonly plan: RestaurantPlan,
    public readonly resource: PlanResource,
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(
      `Your ${PLAN_LIMITS[plan].label} plan allows ${limit} ${resource} (you have ${current}). Upgrade to add more.`,
    );
    this.name = "PlanLimitError";
  }
}

export function checkLimit(
  plan: RestaurantPlan,
  resource: PlanResource,
  current: number,
): void {
  const limits = PLAN_LIMITS[plan];
  const limit =
    resource === "locations"
      ? limits.maxLocations
      : resource === "teamSeats"
      ? limits.maxTeamSeats
      : limits.maxOrdersPerMonth;
  if (limit !== null && current >= limit) {
    throw new PlanLimitError(plan, resource, limit, current);
  }
}

export function planSummary(plan: RestaurantPlan, usage: {
  locations: number;
  teamSeats: number;
  ordersThisMonth: number;
}) {
  const limits = PLAN_LIMITS[plan];
  return {
    plan,
    label: limits.label,
    price: limits.price,
    rows: [
      {
        resource: "locations" as const,
        label: "Locations",
        used: usage.locations,
        limit: limits.maxLocations,
      },
      {
        resource: "teamSeats" as const,
        label: "Team seats",
        used: usage.teamSeats,
        limit: limits.maxTeamSeats,
      },
      {
        resource: "ordersThisMonth" as const,
        label: "Orders this month",
        used: usage.ordersThisMonth,
        limit: limits.maxOrdersPerMonth,
      },
    ],
  };
}
