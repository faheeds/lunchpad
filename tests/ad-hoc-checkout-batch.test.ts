import { beforeEach, describe, expect, it, vi } from "vitest";

// All mocks must be hoisted so vi.mock() factories can reference them.
const {
  deliveryDateFindManyMock,
  schoolFindManyMock,
  parentChildFindManyMock,
  weeklyCheckoutBatchCreateMock,
} = vi.hoisted(() => ({
  deliveryDateFindManyMock: vi.fn(),
  schoolFindManyMock: vi.fn(),
  parentChildFindManyMock: vi.fn(),
  weeklyCheckoutBatchCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deliveryDate: { findMany: deliveryDateFindManyMock },
    school: { findMany: schoolFindManyMock },
    parentChild: { findMany: parentChildFindManyMock },
    weeklyCheckoutBatch: { create: weeklyCheckoutBatchCreateMock },
  },
}));

import { createAdHocCheckoutBatch } from "@/lib/weekly-checkout";

const NOW = new Date("2026-09-08T12:00:00Z");
const FUTURE_CUTOFF = new Date("2026-09-08T15:00:00Z");
const PAST_CUTOFF = new Date("2026-09-08T08:00:00Z");

const MENU_ITEM_BURGER = {
  id: "item-burger",
  name: "Classic Cheeseburger",
  basePriceCents: 1099,
  options: [{ name: "Extra cheese", optionType: "ADD_ON", priceDeltaCents: 100 }],
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

function buildBellevueDeliveryDate(overrides: Record<string, unknown> = {}) {
  return buildDeliveryDate({
    id: "date-bellevue",
    schoolId: "school-bellevue",
    school: { id: "school-bellevue", name: "Medina Academy - Bellevue Campus", timezone: "America/Los_Angeles" },
    ...overrides,
  });
}

const CHILD_HANA_REDMOND = { id: "child-hana", parentUserId: "parent-1", studentName: "Hana", schoolId: "school-redmond", archivedAt: null };
const CHILD_HIBA_REDMOND = { id: "child-hiba", parentUserId: "parent-1", studentName: "Hiba", schoolId: "school-redmond", archivedAt: null };
const CHILD_HUDA_BELLEVUE = { id: "child-huda", parentUserId: "parent-1", studentName: "Huda", schoolId: "school-bellevue", archivedAt: null };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  deliveryDateFindManyMock.mockReset();
  schoolFindManyMock.mockReset();
  parentChildFindManyMock.mockReset();
  weeklyCheckoutBatchCreateMock.mockReset();

  deliveryDateFindManyMock.mockResolvedValue([buildDeliveryDate()]);
  schoolFindManyMock.mockResolvedValue([{ id: "school-redmond", restaurantId: "restaurant-1" }]);
  parentChildFindManyMock.mockResolvedValue([CHILD_HANA_REDMOND, CHILD_HIBA_REDMOND]);
  weeklyCheckoutBatchCreateMock.mockImplementation(async ({ data }) => ({
    id: "batch-1",
    restaurantId: data.restaurantId,
    totalCents: data.totalCents,
    items: data.items.create,
    parentUser: { email: "parent@example.com" },
  }));
});

describe("createAdHocCheckoutBatch — single school (existing behavior)", () => {
  it("creates one batch item per cart item, each correctly attributed to its own child", async () => {
    const batch = await createAdHocCheckoutBatch("parent-1", [
      { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
      { parentChildId: "child-hiba", deliveryDateId: "date-redmond", menuItemId: "item-tenders", additions: [], removals: [] },
    ]);

    expect(weeklyCheckoutBatchCreateMock).toHaveBeenCalledTimes(1);
    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created).toHaveLength(2);
    expect(created[0].parentChildId).toBe("child-hana");
    expect(created[1].parentChildId).toBe("child-hiba");
    expect(batch.totalCents).toBe(1099 + 999);
  });

  it("correctly sums add-on option prices into the resolved line total", async () => {
    await createAdHocCheckoutBatch("parent-1", [
      { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: ["Extra cheese"], removals: [] },
    ]);
    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].lineTotalCents).toBe(1099 + 100);
  });

  it("rejects a parentChildId that does not belong to the authenticated parent", async () => {
    parentChildFindManyMock.mockResolvedValue([CHILD_HANA_REDMOND]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-someone-elses", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/could not be verified/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a child whose home school doesn't match their item's delivery date (the real bug found in testing)", async () => {
    deliveryDateFindManyMock.mockResolvedValue([buildBellevueDeliveryDate()]);
    schoolFindManyMock.mockResolvedValue([{ id: "school-bellevue", restaurantId: "restaurant-1" }]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-bellevue", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/different location/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when ordering has closed for the delivery date (cutoff passed)", async () => {
    deliveryDateFindManyMock.mockResolvedValue([buildDeliveryDate({ cutoffAt: PAST_CUTOFF })]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/ordering has closed/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when ordering is explicitly closed for the delivery date", async () => {
    deliveryDateFindManyMock.mockResolvedValue([buildDeliveryDate({ orderingOpen: false })]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/ordering has closed/i);
  });

  it("skips an item that isn't available on this delivery date and reports why", async () => {
    deliveryDateFindManyMock.mockResolvedValue([
      buildDeliveryDate({ menuAvailability: [{ menuItemId: "item-burger", menuItem: MENU_ITEM_BURGER }] }),
    ]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-tenders", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/no longer available/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a sized item with no size selected", async () => {
    const sizedItem = {
      ...MENU_ITEM_BURGER,
      id: "item-sized",
      sizes: [{ name: "Small", priceCents: 500 }, { name: "Large", priceCents: 800 }],
    };
    deliveryDateFindManyMock.mockResolvedValue([
      buildDeliveryDate({ menuAvailability: [{ menuItemId: "item-sized", menuItem: sizedItem }] }),
    ]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-sized", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/missing a size selection/i);
  });

  it("uses the matched size's price, not the item's base price, when a size is selected", async () => {
    const sizedItem = {
      ...MENU_ITEM_BURGER,
      id: "item-sized",
      basePriceCents: 999999,
      sizes: [{ name: "Small", priceCents: 500 }, { name: "Large", priceCents: 800 }],
    };
    deliveryDateFindManyMock.mockResolvedValue([
      buildDeliveryDate({ menuAvailability: [{ menuItemId: "item-sized", menuItem: sizedItem }] }),
    ]);

    await createAdHocCheckoutBatch("parent-1", [
      { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-sized", size: "Large", additions: [], removals: [] },
    ]);
    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].lineTotalCents).toBe(800);
  });

  it("rejects an empty cart", async () => {
    await expect(createAdHocCheckoutBatch("parent-1", [])).rejects.toThrow(/cart is empty/i);
    expect(deliveryDateFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects when a referenced delivery date doesn't exist", async () => {
    deliveryDateFindManyMock.mockResolvedValue([]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-missing", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/delivery date not found/i);
  });
});

describe("createAdHocCheckoutBatch — multiple schools in one cart", () => {
  beforeEach(() => {
    deliveryDateFindManyMock.mockResolvedValue([buildDeliveryDate(), buildBellevueDeliveryDate()]);
    schoolFindManyMock.mockResolvedValue([
      { id: "school-redmond", restaurantId: "restaurant-1" },
      { id: "school-bellevue", restaurantId: "restaurant-1" },
    ]);
    parentChildFindManyMock.mockResolvedValue([CHILD_HANA_REDMOND, CHILD_HUDA_BELLEVUE]);
  });

  it("allows a Redmond child and a Bellevue child in the same cart, each against their own correct delivery date", async () => {
    const batch = await createAdHocCheckoutBatch("parent-1", [
      { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
      { parentChildId: "child-huda", deliveryDateId: "date-bellevue", menuItemId: "item-tenders", additions: [], removals: [] },
    ]);

    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created).toHaveLength(2);
    expect(created.find((i: { parentChildId: string }) => i.parentChildId === "child-hana").schoolId).toBe("school-redmond");
    expect(created.find((i: { parentChildId: string }) => i.parentChildId === "child-huda").schoolId).toBe("school-bellevue");
    expect(batch.totalCents).toBe(1099 + 999);
  });

  it("still rejects a child assigned to the wrong school's delivery date even when the cart genuinely spans multiple schools", async () => {
    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-bellevue", menuItemId: "item-burger", additions: [], removals: [] },
        { parentChildId: "child-huda", deliveryDateId: "date-bellevue", menuItemId: "item-tenders", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/different location/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects if ordering has closed at just one of the two schools in the cart", async () => {
    deliveryDateFindManyMock.mockResolvedValue([
      buildDeliveryDate(),
      buildBellevueDeliveryDate({ cutoffAt: PAST_CUTOFF }),
    ]);

    await expect(
      createAdHocCheckoutBatch("parent-1", [
        { parentChildId: "child-hana", deliveryDateId: "date-redmond", menuItemId: "item-burger", additions: [], removals: [] },
        { parentChildId: "child-huda", deliveryDateId: "date-bellevue", menuItemId: "item-tenders", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/ordering has closed/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });
});
