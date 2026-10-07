import { beforeEach, describe, expect, it, vi } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import type { Discount } from "@prisma/client";

const { discountFindManyMock, schoolFindUniqueMock, orderFindManyMock, orderCountMock, redemptionGroupByMock } =
  vi.hoisted(() => ({
    discountFindManyMock: vi.fn(),
    schoolFindUniqueMock: vi.fn(),
    orderFindManyMock: vi.fn(),
    orderCountMock: vi.fn(),
    redemptionGroupByMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    discount: { findMany: discountFindManyMock },
    school: { findUnique: schoolFindUniqueMock },
    order: { findMany: orderFindManyMock, count: orderCountMock },
    discountRedemption: { groupBy: redemptionGroupByMock },
  },
}));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn() }));

import {
  dayNumberInWeek,
  describeWeeklyTiers,
  mondayKeyOf,
  parseWeeklyTiers,
  tierPercentForDay,
  planMultiDayReprice,
} from "@/lib/volume-discount";
import { evaluate, pickApplicableDiscounts, type CartContext } from "@/lib/discounts";

const TZ = "America/Los_Angeles";
/** Local-midnight instant for a yyyy-MM-dd delivery date in the school's timezone. */
const day = (ymd: string) => fromZonedTime(`${ymd} 00:00:00`, TZ);

// Week of Mon 2026-10-05 .. Sun 2026-10-11
const MON = "2026-10-05";
const TUE = "2026-10-06";
const WED = "2026-10-07";
const THU = "2026-10-08";

const TIERS = [
  { dayNumber: 3, percent: 25 },
  { dayNumber: 4, percent: 50 },
];

function discount(overrides: Partial<Discount> = {}): Discount {
  const now = new Date();
  return {
    id: "multi-day-1",
    restaurantId: "r1",
    templateKind: "MULTI_DAY",
    name: "Multi-day savings",
    description: null,
    code: null,
    kind: "PERCENT",
    value: 50,
    scope: "ORDER",
    itemIds: [],
    categories: [],
    minOrderCents: null,
    minItemCount: null,
    firstOrderOnly: false,
    schoolIds: [],
    grades: [],
    weekdays: [],
    weeklyTiers: TIERS,
    startsAt: null,
    endsAt: null,
    maxRedemptionsTotal: null,
    maxRedemptionsPerUser: null,
    allowStackingWithCode: false,
    bogoBuyItemIds: [],
    bogoGetItemIds: [],
    isActive: true,
    currentRedemptions: 0,
    createdAt: now,
    updatedAt: now,
    createdByAdminId: null,
    ...overrides,
  } as Discount;
}

function cart(ymd: string, extra: Partial<CartContext> = {}): CartContext {
  return {
    restaurantId: "r1",
    schoolId: "s1",
    deliveryDate: day(ymd),
    parentUserId: "p1",
    lines: [{ menuItemId: "m1", lineTotalCents: 1200 }],
    ...extra,
  };
}

describe("volume-discount helpers", () => {
  it("parses tiers defensively and sorts them", () => {
    expect(parseWeeklyTiers(null)).toEqual([]);
    expect(parseWeeklyTiers("nope")).toEqual([]);
    expect(
      parseWeeklyTiers([
        { dayNumber: 4, percent: 50 },
        { dayNumber: 3, percent: 25 },
        { dayNumber: 0, percent: 10 },
        { dayNumber: 5, percent: 0 },
        { dayNumber: 6, percent: 150 },
        null,
      ])
    ).toEqual([
      { dayNumber: 3, percent: 25 },
      { dayNumber: 4, percent: 50 },
    ]);
  });

  it("picks the highest tier at or below the day number", () => {
    expect(tierPercentForDay(TIERS, 1)).toBe(0);
    expect(tierPercentForDay(TIERS, 2)).toBe(0);
    expect(tierPercentForDay(TIERS, 3)).toBe(25);
    expect(tierPercentForDay(TIERS, 4)).toBe(50);
    expect(tierPercentForDay(TIERS, 5)).toBe(50); // last tier covers later days
  });

  it("finds the Monday of a Mon-Sun week", () => {
    expect(mondayKeyOf("2026-10-05")).toBe("2026-10-05"); // Mon
    expect(mondayKeyOf("2026-10-07")).toBe("2026-10-05"); // Wed
    expect(mondayKeyOf("2026-10-11")).toBe("2026-10-05"); // Sun
    expect(mondayKeyOf("2026-10-12")).toBe("2026-10-12"); // next Mon
  });

  it("counts distinct earlier delivery days in the same week", () => {
    const base = { timezone: TZ };
    expect(dayNumberInWeek({ ...base, targetDate: day(MON), otherDates: [] })).toBe(1);
    expect(dayNumberInWeek({ ...base, targetDate: day(WED), otherDates: [day(MON), day(TUE)] })).toBe(3);
    // Siblings on the same day count once.
    expect(dayNumberInWeek({ ...base, targetDate: day(WED), otherDates: [day(MON), day(MON), day(TUE)] })).toBe(3);
    // Later days and the target day itself don't count.
    expect(dayNumberInWeek({ ...base, targetDate: day(TUE), otherDates: [day(WED), day(THU), day(TUE)] })).toBe(1);
    // A previous week doesn't count.
    expect(dayNumberInWeek({ ...base, targetDate: day(MON), otherDates: [day("2026-10-02"), day("2026-10-01")] })).toBe(1);
  });

  it("describes tiers for customers", () => {
    expect(describeWeeklyTiers(TIERS)).toBe("25% off your 3rd day and 50% off your 4th+ day each week");
  });
});

describe("evaluate() with weekly tiers", () => {
  const ctx = (n: number | null) => ({
    cart: cart(WED),
    priorOrderCount: 0,
    perUserCounts: new Map<string, number>(),
    dayNumberInWeek: n,
  });

  it("gives nothing on days 1 and 2", () => {
    expect(evaluate(discount(), ctx(1)).amountCents).toBe(0);
    expect(evaluate(discount(), ctx(2)).amountCents).toBe(0);
    expect(evaluate(discount(), ctx(null)).amountCents).toBe(0);
  });

  it("gives 25% on day 3 and 50% on day 4+", () => {
    const d3 = evaluate(discount(), ctx(3));
    expect(d3.amountCents).toBe(300);
    expect(d3.meta).toEqual({ dayNumber: 3, percent: 25 });
    expect(evaluate(discount(), ctx(4)).amountCents).toBe(600);
    expect(evaluate(discount(), ctx(5)).amountCents).toBe(600);
  });

  it("leaves non-tiered discounts untouched", () => {
    const plain = discount({ weeklyTiers: null, value: 10, templateKind: "CUSTOM" });
    expect(evaluate(plain, ctx(1)).amountCents).toBe(120);
  });
});

describe("pickApplicableDiscounts() with weekly tiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schoolFindUniqueMock.mockResolvedValue({ timezone: TZ });
    orderFindManyMock.mockResolvedValue([]);
    redemptionGroupByMock.mockResolvedValue([]);
    orderCountMock.mockResolvedValue(0);
  });

  it("counts the family's already-paid days", async () => {
    discountFindManyMock.mockResolvedValue([discount()]);
    orderFindManyMock.mockResolvedValue([
      { deliveryDate: { deliveryDate: day(MON) } },
      { deliveryDate: { deliveryDate: day(TUE) } },
    ]);
    const result = await pickApplicableDiscounts({ cart: cart(WED) });
    expect(result.auto?.amountCents).toBe(300);
    expect(result.auto?.meta?.dayNumber).toBe(3);
  });

  it("counts the other days in the same checkout (nothing paid yet)", async () => {
    discountFindManyMock.mockResolvedValue([discount()]);
    const result = await pickApplicableDiscounts({
      cart: cart(THU, { sameCheckoutDeliveryDates: [day(MON), day(TUE), day(WED), day(THU)] }),
    });
    expect(result.auto?.amountCents).toBe(600); // Thursday is day 4 → 50%
  });

  it("gives nothing on a first day", async () => {
    discountFindManyMock.mockResolvedValue([discount()]);
    const result = await pickApplicableDiscounts({ cart: cart(MON, { sameCheckoutDeliveryDates: [day(MON), day(TUE)] }) });
    expect(result.auto).toBeNull();
  });

  it("matches guest orders by email when there is no account", async () => {
    discountFindManyMock.mockResolvedValue([discount()]);
    await pickApplicableDiscounts({ cart: cart(WED, { parentUserId: null, parentEmail: "Mom@Example.com" }) });
    const where = orderFindManyMock.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ parentEmail: { equals: "Mom@Example.com", mode: "insensitive" } }]);
  });

  it("does no extra lookups when no multi-day discount exists", async () => {
    discountFindManyMock.mockResolvedValue([discount({ weeklyTiers: null, templateKind: "CUSTOM", value: 10 })]);
    const result = await pickApplicableDiscounts({ cart: cart(WED) });
    expect(result.auto?.amountCents).toBe(120);
    expect(schoolFindUniqueMock).not.toHaveBeenCalled();
    expect(orderFindManyMock).not.toHaveBeenCalled();
  });
});

describe("planMultiDayReprice", () => {
  const tiers = [
    { dayNumber: 3, percent: 25 },
    { dayNumber: 4, percent: 50 },
  ];
  const tz = "America/Los_Angeles";
  const d = (iso: string) => new Date(`${iso}T19:00:00Z`);
  // Mon Oct 12 .. Thu Oct 15 2026; $9.99 each, 10% tax on the net price.
  const mk = (id: string, day: string, discount: number) => ({
    id,
    deliveryDate: d(day),
    subtotalCents: 999,
    discountCents: discount,
    totalCents: Math.round((999 - discount) * 1.1),
  });
  const week = [mk("mon", "2026-10-12", 0), mk("tue", "2026-10-13", 0), mk("wed", "2026-10-14", 249), mk("thu", "2026-10-15", 499)];

  it("cancelling Monday drops Wed to no discount and Thu to 25%", () => {
    const plan = planMultiDayReprice({ tiers, timezone: tz, cancelledId: "mon", orders: week });
    const wed = plan.find((p) => p.orderId === "wed")!;
    const thu = plan.find((p) => p.orderId === "thu")!;
    expect(wed.newDiscountCents).toBe(0);
    expect(wed.lostDiscountCents).toBe(249);
    expect(wed.addCents).toBe(Math.round((249 * week[2].totalCents) / (999 - 249)));
    expect(thu.newDiscountCents).toBe(249);
    expect(thu.lostDiscountCents).toBe(250);
  });

  it("cancelling the last day changes nothing", () => {
    expect(planMultiDayReprice({ tiers, timezone: tz, cancelledId: "thu", orders: week })).toEqual([]);
  });

  it("a sibling order on the same day keeps the day alive", () => {
    const sibling = { ...mk("mon2", "2026-10-12", 0) };
    expect(planMultiDayReprice({ tiers, timezone: tz, cancelledId: "mon", orders: [...week, sibling] })).toEqual([]);
  });
});
