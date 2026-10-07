import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Discount } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";

// Same hoisted-mock pattern as tests/ad-hoc-checkout-batch.test.ts — this
// file exists specifically to verify the discount engine is now actually
// wired into the batch/ad-hoc checkout path (lib/weekly-checkout.ts),
// which previously never called pickApplicableDiscounts at all. That gap
// is what caused "no discount/promo on iOS" — iOS's real cart checkout
// goes through createAdHocCheckoutBatch, not the single-order flow in
// lib/orders.ts.
const {
  deliveryDateFindManyMock,
  schoolFindManyMock,
  parentChildFindManyMock,
  weeklyCheckoutBatchCreateMock,
  restaurantFindUniqueMock,
  orderCountMock,
  discountFindManyMock,
  discountRedemptionGroupByMock,
  schoolFindUniqueMock,
  orderFindManyMock,
} = vi.hoisted(() => ({
  deliveryDateFindManyMock: vi.fn(),
  schoolFindManyMock: vi.fn(),
  parentChildFindManyMock: vi.fn(),
  weeklyCheckoutBatchCreateMock: vi.fn(),
  restaurantFindUniqueMock: vi.fn(),
  orderCountMock: vi.fn(),
  discountFindManyMock: vi.fn(),
  discountRedemptionGroupByMock: vi.fn(),
  schoolFindUniqueMock: vi.fn(),
  orderFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deliveryDate: { findMany: deliveryDateFindManyMock },
    school: { findMany: schoolFindManyMock, findUnique: schoolFindUniqueMock },
    parentChild: { findMany: parentChildFindManyMock },
    weeklyCheckoutBatch: { create: weeklyCheckoutBatchCreateMock },
    restaurant: { findUnique: restaurantFindUniqueMock },
    order: { count: orderCountMock, findMany: orderFindManyMock },
    discount: { findMany: discountFindManyMock },
    discountRedemption: { groupBy: discountRedemptionGroupByMock },
  },
}));

import { createAdHocCheckoutBatch } from "@/lib/weekly-checkout";

const NOW = new Date("2026-09-08T12:00:00Z"); // a Tuesday
const FUTURE_CUTOFF = new Date("2026-09-08T15:00:00Z");

function createDiscount(overrides: Partial<Discount> = {}): Discount {
  const now = new Date();
  return {
    id: "discount-1",
    restaurantId: "restaurant-1",
    templateKind: "WELCOME",
    name: "Welcome Offer",
    description: null,
    code: null,
    kind: "FIXED_AMOUNT",
    value: 500,
    scope: "ORDER",
    itemIds: [],
    categories: [],
    minOrderCents: null,
    minItemCount: null,
    firstOrderOnly: false,
    schoolIds: [],
    grades: [],
    weekdays: [],
    weeklyTiers: null,
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
  };
}

const MENU_ITEM_BURGER = {
  id: "item-burger",
  name: "Classic Cheeseburger",
  basePriceCents: 1099,
  options: [],
  sizes: [],
  requiredChoices: [],
  slug: "classic-cheeseburger",
};

const MENU_ITEM_TENDERS = {
  id: "item-tenders",
  name: "Chicken Tenders",
  basePriceCents: 999,
  options: [],
  sizes: [],
  requiredChoices: [],
  slug: "chicken-tenders",
};

function buildDeliveryDate(overrides: Record<string, unknown> = {}) {
  return {
    id: "date-redmond",
    schoolId: "school-redmond",
    deliveryDate: NOW,
    orderingOpen: true,
    cutoffAt: FUTURE_CUTOFF,
    school: { id: "school-redmond", name: "Medina Academy - Redmond Campus", timezone: "America/Los_Angeles" },
    menuAvailability: [
      { menuItemId: "item-burger", menuItem: MENU_ITEM_BURGER },
      { menuItemId: "item-tenders", menuItem: MENU_ITEM_TENDERS },
    ],
    ...overrides,
  };
}

const CHILD_HANA = { id: "child-hana", parentUserId: "parent-1", studentName: "Hana", grade: "3rd Grade", schoolId: "school-redmond", archivedAt: null };
const CHILD_HIBA = { id: "child-hiba", parentUserId: "parent-1", studentName: "Hiba", grade: "5th Grade", schoolId: "school-redmond", archivedAt: null };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  deliveryDateFindManyMock.mockReset();
  schoolFindManyMock.mockReset();
  parentChildFindManyMock.mockReset();
  weeklyCheckoutBatchCreateMock.mockReset();
  restaurantFindUniqueMock.mockReset();
  orderCountMock.mockReset();
  discountFindManyMock.mockReset();
  discountRedemptionGroupByMock.mockReset();

  discountFindManyMock.mockResolvedValue([]);
  discountRedemptionGroupByMock.mockResolvedValue([]);

  deliveryDateFindManyMock.mockResolvedValue([buildDeliveryDate()]);
  schoolFindManyMock.mockResolvedValue([{ id: "school-redmond", restaurantId: "restaurant-1" }]);
  parentChildFindManyMock.mockResolvedValue([CHILD_HANA, CHILD_HIBA]);
  restaurantFindUniqueMock.mockResolvedValue({ plan: "SCALE" });
  orderCountMock.mockResolvedValue(0);
  weeklyCheckoutBatchCreateMock.mockImplementation(async ({ data }) => ({
    id: "batch-1",
    restaurantId: data.restaurantId,
    subtotalCents: data.subtotalCents,
    discountCents: data.discountCents,
    totalCents: data.totalCents,
    items: data.items.create,
    parentUser: { email: "parent@example.com" },
  }));
});

describe("createAdHocCheckoutBatch — discount engine integration", () => {
  it("applies an eligible auto-discount to a matching child's item and reduces the batch total", async () => {
    discountFindManyMock.mockResolvedValue([
      createDiscount({ id: "discount-welcome", name: "Welcome Offer", kind: "FIXED_AMOUNT", value: 300, firstOrderOnly: true }),
    ]);
    orderCountMock.mockResolvedValue(0); // Hana has never ordered before

    const batch = await createAdHocCheckoutBatch("parent-1", [
      { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
    ]);

    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].discountId).toBe("discount-welcome");
    expect(created[0].discountCents).toBe(300);
    expect(batch.subtotalCents).toBe(1099);
    expect(batch.discountCents).toBe(300);
    expect(batch.totalCents).toBe(1099 - 300);
  });

  it("scores discount eligibility independently per child in the same cart", async () => {
    // firstOrderOnly welcome offer: Hana is eligible, Hiba already ordered
    // before, so the same cart should apply the discount to one item but
    // not the other.
    discountFindManyMock.mockResolvedValue([
      createDiscount({ id: "discount-welcome", name: "Welcome Offer", kind: "FIXED_AMOUNT", value: 300, firstOrderOnly: true }),
    ]);
    orderCountMock.mockImplementation(async ({ where }: any) => {
      const studentName = where?.student?.studentName?.equals;
      return studentName === "Hiba" ? 1 : 0;
    });

    const batch = await createAdHocCheckoutBatch("parent-1", [
      { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
      { parentChildId: "child-hiba", deliveryDateId: "date-redmond", menuItemId: "item-tenders", additions: [], removals: [] },
    ]);

    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    const hanaItem = created.find((i: { parentChildId: string }) => i.parentChildId === "child-hana");
    const hibaItem = created.find((i: { parentChildId: string }) => i.parentChildId === "child-hiba");

    expect(hanaItem.discountId).toBe("discount-welcome");
    expect(hanaItem.discountCents).toBe(300);
    expect(hibaItem.discountId).toBeNull();
    expect(hibaItem.discountCents).toBe(0);

    expect(batch.subtotalCents).toBe(1099 + 999);
    expect(batch.discountCents).toBe(300);
    expect(batch.totalCents).toBe(1099 + 999 - 300);
  });

  it("scores multi-day tiers across the whole cart: day 3 = 25%, day 4 = 50%", async () => {
    // One lunch on each of Mon-Thu, nothing paid yet. Every item must see
    // the OTHER days in the same checkout to know which day of the week it is.
    discountFindManyMock.mockResolvedValue([
      createDiscount({
        id: "discount-multi",
        name: "Multi-day savings",
        templateKind: "MULTI_DAY",
        kind: "PERCENT",
        value: 50,
        weeklyTiers: [
          { dayNumber: 3, percent: 25 },
          { dayNumber: 4, percent: 50 },
        ],
      }),
    ]);
    schoolFindUniqueMock.mockResolvedValue({ timezone: "America/Los_Angeles" });
    orderFindManyMock.mockResolvedValue([]);

    const ymds = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    deliveryDateFindManyMock.mockResolvedValue(
      ymds.map((ymd, i) =>
        buildDeliveryDate({ id: `date-${i}`, deliveryDate: fromZonedTime(`${ymd} 00:00:00`, "America/Los_Angeles") })
      )
    );

    const batch = await createAdHocCheckoutBatch(
      "parent-1",
      ymds.map((_, i) => ({
        parentChildId: "child-hana",
        deliveryDateId: `date-${i}`,
        menuItemId: "item-burger",
        additions: [],
        removals: [],
      }))
    );

    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created.map((i: { discountCents: number }) => i.discountCents)).toEqual([
      0,
      0,
      Math.floor(1099 * 0.25),
      Math.floor(1099 * 0.5),
    ]);
    expect(batch.discountCents).toBe(Math.floor(1099 * 0.25) + Math.floor(1099 * 0.5));
    // The persisted item rows carry no scoring scratch data.
    expect(created[0]).not.toHaveProperty("_score");
  });

  it("applies a promo code discount when a valid code is passed", async () => {
    discountFindManyMock.mockResolvedValue([
      createDiscount({ id: "discount-promo", name: "FALL10", code: "FALL10", kind: "PERCENT", value: 10 }),
    ]);

    const batch = await createAdHocCheckoutBatch(
      "parent-1",
      [{ parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] }],
      "fall10" // lower-case on purpose — matching is case-insensitive
    );

    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].discountId).toBe("discount-promo");
    expect(created[0].discountCents).toBe(109); // 10% of 1099 = 109.9, floored
    expect(batch.discountCents).toBe(109);
    expect(batch.totalCents).toBe(1099 - 109);
  });

  it("ignores an invalid/unknown promo code rather than failing checkout", async () => {
    discountFindManyMock.mockResolvedValue([
      createDiscount({ id: "discount-promo", name: "FALL10", code: "FALL10", kind: "PERCENT", value: 10 }),
    ]);

    const batch = await createAdHocCheckoutBatch(
      "parent-1",
      [{ parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] }],
      "NOT-A-REAL-CODE"
    );

    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].discountId).toBeNull();
    expect(created[0].discountCents).toBe(0);
    expect(batch.totalCents).toBe(1099);
  });

  it("leaves totals unchanged (matches pre-fix behavior exactly) when no discounts are active", async () => {
    const batch = await createAdHocCheckoutBatch("parent-1", [
      { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
    ]);

    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].discountId).toBeNull();
    expect(created[0].discountCents).toBe(0);
    expect(batch.subtotalCents).toBe(1099);
    expect(batch.discountCents).toBe(0);
    expect(batch.totalCents).toBe(1099);
  });
});
