import { beforeEach, describe, expect, it, vi } from "vitest";

// All mocks must be hoisted so vi.mock() factories can reference them.
const {
  deliveryDateFindUniqueMock,
  schoolFindUniqueMock,
  parentChildFindManyMock,
  weeklyCheckoutBatchCreateMock,
} = vi.hoisted(() => ({
  deliveryDateFindUniqueMock: vi.fn(),
  schoolFindUniqueMock: vi.fn(),
  parentChildFindManyMock: vi.fn(),
  weeklyCheckoutBatchCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deliveryDate: { findUnique: deliveryDateFindUniqueMock },
    school: { findUnique: schoolFindUniqueMock },
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
    id: "date-1",
    schoolId: "school-1",
    deliveryDate: NOW,
    orderingOpen: true,
    cutoffAt: FUTURE_CUTOFF,
    school: { id: "school-1", name: "Medina Academy - Bellevue Campus", timezone: "America/Los_Angeles" },
    menuAvailability: [
      { menuItemId: "item-burger", menuItem: MENU_ITEM_BURGER },
      { menuItemId: "item-tenders", menuItem: MENU_ITEM_TENDERS },
    ],
    ...overrides,
  };
}

const CHILD_HANA = { id: "child-hana", parentUserId: "parent-1", studentName: "Hana", schoolId: "school-1", archivedAt: null };
const CHILD_HIBA = { id: "child-hiba", parentUserId: "parent-1", studentName: "Hiba", schoolId: "school-1", archivedAt: null };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  deliveryDateFindUniqueMock.mockReset();
  schoolFindUniqueMock.mockReset();
  parentChildFindManyMock.mockReset();
  weeklyCheckoutBatchCreateMock.mockReset();

  deliveryDateFindUniqueMock.mockResolvedValue(buildDeliveryDate());
  schoolFindUniqueMock.mockResolvedValue({ restaurantId: "restaurant-1" });
  parentChildFindManyMock.mockResolvedValue([CHILD_HANA, CHILD_HIBA]);
  weeklyCheckoutBatchCreateMock.mockImplementation(async ({ data }) => ({
    id: "batch-1",
    restaurantId: data.restaurantId,
    totalCents: data.totalCents,
    items: data.items.create,
    parentUser: { email: "parent@example.com" },
  }));
});

describe("createAdHocCheckoutBatch", () => {
  it("creates one batch item per cart item, each correctly attributed to its own child", async () => {
    const batch = await createAdHocCheckoutBatch("parent-1", "date-1", [
      { parentChildId: "child-hana", menuItemId: "item-burger", additions: [], removals: [] },
      { parentChildId: "child-hiba", menuItemId: "item-tenders", additions: [], removals: [] },
    ]);

    expect(weeklyCheckoutBatchCreateMock).toHaveBeenCalledTimes(1);
    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created).toHaveLength(2);
    expect(created[0].parentChildId).toBe("child-hana");
    expect(created[1].parentChildId).toBe("child-hiba");
    expect(batch.totalCents).toBe(1099 + 999);
  });

  it("correctly sums add-on option prices into the resolved line total", async () => {
    await createAdHocCheckoutBatch("parent-1", "date-1", [
      { parentChildId: "child-hana", menuItemId: "item-burger", additions: ["Extra cheese"], removals: [] },
    ]);
    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].lineTotalCents).toBe(1099 + 100);
  });

  it("rejects a parentChildId that does not belong to the authenticated parent", async () => {
    // Only Hana is a real child of this parent; "child-someone-elses" is not.
    parentChildFindManyMock.mockResolvedValue([CHILD_HANA]);

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-1", [
        { parentChildId: "child-someone-elses", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/could not be verified/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a child whose home school doesn't match the delivery date's school (the real bug found in testing)", async () => {
    // Redmond-registered child, Bellevue delivery date -- exactly the
    // real scenario that produced a wrong, paid order.
    const redmondChild = { ...CHILD_HANA, schoolId: "school-redmond" };
    parentChildFindManyMock.mockResolvedValue([redmondChild]);
    deliveryDateFindUniqueMock.mockResolvedValue(buildDeliveryDate({ schoolId: "school-bellevue" }));

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-1", [
        { parentChildId: "child-hana", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/different location/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when even one of several children is at the wrong school, not just when all are", async () => {
    const redmondChild = { ...CHILD_HIBA, schoolId: "school-redmond" };
    parentChildFindManyMock.mockResolvedValue([CHILD_HANA, redmondChild]); // Hana matches, Hiba doesn't

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-1", [
        { parentChildId: "child-hana", menuItemId: "item-burger", additions: [], removals: [] },
        { parentChildId: "child-hiba", menuItemId: "item-tenders", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/different location/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when ordering has closed for the delivery date (cutoff passed)", async () => {
    deliveryDateFindUniqueMock.mockResolvedValue(buildDeliveryDate({ cutoffAt: PAST_CUTOFF }));

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-1", [
        { parentChildId: "child-hana", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/ordering has closed/i);

    expect(weeklyCheckoutBatchCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when ordering is explicitly closed for the delivery date", async () => {
    deliveryDateFindUniqueMock.mockResolvedValue(buildDeliveryDate({ orderingOpen: false }));

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-1", [
        { parentChildId: "child-hana", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/ordering has closed/i);
  });

  it("skips an item that isn't available on this delivery date and reports why", async () => {
    deliveryDateFindUniqueMock.mockResolvedValue(
      buildDeliveryDate({ menuAvailability: [{ menuItemId: "item-burger", menuItem: MENU_ITEM_BURGER }] })
    );

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-1", [
        { parentChildId: "child-hana", menuItemId: "item-tenders", additions: [], removals: [] },
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
    deliveryDateFindUniqueMock.mockResolvedValue(
      buildDeliveryDate({ menuAvailability: [{ menuItemId: "item-sized", menuItem: sizedItem }] })
    );

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-1", [
        { parentChildId: "child-hana", menuItemId: "item-sized", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/missing a size selection/i);
  });

  it("uses the matched size's price, not the item's base price, when a size is selected", async () => {
    const sizedItem = {
      ...MENU_ITEM_BURGER,
      id: "item-sized",
      basePriceCents: 999999, // sentinel — must NOT be used when a size matches
      sizes: [{ name: "Small", priceCents: 500 }, { name: "Large", priceCents: 800 }],
    };
    deliveryDateFindUniqueMock.mockResolvedValue(
      buildDeliveryDate({ menuAvailability: [{ menuItemId: "item-sized", menuItem: sizedItem }] })
    );

    await createAdHocCheckoutBatch("parent-1", "date-1", [
      { parentChildId: "child-hana", menuItemId: "item-sized", size: "Large", additions: [], removals: [] },
    ]);
    const created = weeklyCheckoutBatchCreateMock.mock.calls[0][0].data.items.create;
    expect(created[0].lineTotalCents).toBe(800);
  });

  it("rejects an empty cart", async () => {
    await expect(createAdHocCheckoutBatch("parent-1", "date-1", [])).rejects.toThrow(/cart is empty/i);
    expect(deliveryDateFindUniqueMock).not.toHaveBeenCalled();
  });

  it("rejects when the delivery date doesn't exist", async () => {
    deliveryDateFindUniqueMock.mockResolvedValue(null);

    await expect(
      createAdHocCheckoutBatch("parent-1", "date-missing", [
        { parentChildId: "child-hana", menuItemId: "item-burger", additions: [], removals: [] },
      ])
    ).rejects.toThrow(/delivery date not found/i);
  });
});
