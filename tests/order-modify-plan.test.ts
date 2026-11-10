import { describe, it, expect } from "vitest";
import { planOrderModification, type ExistingLine, type MenuLite } from "@/lib/order-modify-plan";

const burger: MenuLite = {
  id: "m1",
  name: "Burger",
  basePriceCents: 1000,
  sizes: [],
  requiredChoices: [],
  options: [
    { name: "Bacon", optionType: "ADD_ON", priceDeltaCents: 200 },
    { name: "Onion", optionType: "REMOVAL", priceDeltaCents: 0 },
  ],
};
const fries: MenuLite = { id: "m2", name: "Fries", basePriceCents: 400, sizes: [{ name: "L", priceCents: 600 }], requiredChoices: [], options: [] };

const line = (id: string, over: Partial<ExistingLine> = {}): ExistingLine => ({
  id, menuItemId: "m1", itemNameSnapshot: "Burger", basePriceCents: 1000, sizeName: null,
  additions: [], removals: [], lineTotalCents: 1000, refunded: false, menu: burger, ...over,
});
const avail = new Map([["m1", burger], ["m2", fries]]);
const base = { available: avail, currentSubtotalCents: 2000, currentTotalCents: 1800, discountCents: 200 };
const empty = { updates: [], removeItemIds: [], adds: [] };

describe("planOrderModification", () => {
  it("removing a line lowers total and keeps the fixed discount", () => {
    const p = planOrderModification({ ...base, lines: [line("a"), line("b")], request: { ...empty, removeItemIds: ["b"] } });
    expect(p.newSubtotalCents).toBe(1000);
    expect(p.newTotalCents).toBe(800);
    expect(p.deltaCents).toBe(-1000);
  });
  it("adding a quantity creates one row per unit with size pricing", () => {
    const p = planOrderModification({ ...base, lines: [line("a"), line("b")], request: { ...empty, adds: [{ menuItemId: "m2", size: "L", additions: [], removals: [], quantity: 3 }] } });
    expect(p.creates).toHaveLength(3);
    expect(p.deltaCents).toBe(1800);
  });
  it("changing add-ons reprices the line", () => {
    const p = planOrderModification({ ...base, lines: [line("a"), line("b")], request: { ...empty, updates: [{ orderItemId: "a", additions: ["Bacon"], removals: ["Onion"] }] } });
    expect(p.updates[0].lineTotalCents).toBe(1200);
    expect(p.deltaCents).toBe(200);
  });
  it("rejects invalid add-ons, empty orders, no-ops and refunded lines", () => {
    const lines = [line("a"), line("b")];
    expect(() => planOrderModification({ ...base, lines, request: { ...empty, updates: [{ orderItemId: "a", additions: ["Gold"], removals: [] }] } })).toThrow();
    expect(() => planOrderModification({ ...base, lines, request: { ...empty, removeItemIds: ["a", "b"] } })).toThrow(/at least one/);
    expect(() => planOrderModification({ ...base, lines, request: empty })).toThrow(/No changes/);
    expect(() => planOrderModification({ ...base, lines: [line("a", { refunded: true }), line("b")], request: { ...empty, removeItemIds: ["a"] } })).toThrow(/refunded/);
  });
  it("keeps a stored required choice when add-ons change", () => {
    const m: MenuLite = { ...burger, requiredChoices: ["Beef"] };
    const l = line("a", { additions: ["Beef"], menu: m });
    const p = planOrderModification({ ...base, lines: [l, line("b")], request: { ...empty, updates: [{ orderItemId: "a", additions: ["Bacon"], removals: [] }] } });
    expect(p.updates[0].additions).toEqual(["Beef", "Bacon"]);
  });
});
