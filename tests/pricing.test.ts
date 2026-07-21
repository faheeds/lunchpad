import { describe, expect, it } from "vitest";
import { resolveLineItemPrice } from "@/lib/pricing";

describe("resolveLineItemPrice", () => {
  it("returns basePriceCents when no size and no additions are supplied", () => {
    expect(resolveLineItemPrice({ basePriceCents: 1000 })).toBe(1000);
  });

  it("uses size.priceCents as the base when a size is supplied (size overrides basePriceCents)", () => {
    expect(
      resolveLineItemPrice({
        basePriceCents: 1000,
        size: { priceCents: 1500 },
      })
    ).toBe(1500);
  });

  it("adds a single positive addition delta on top of the base price", () => {
    expect(
      resolveLineItemPrice({
        basePriceCents: 1000,
        additions: [{ priceDeltaCents: 250 }],
      })
    ).toBe(1250);
  });

  it("sums multiple positive addition deltas correctly", () => {
    expect(
      resolveLineItemPrice({
        basePriceCents: 1000,
        additions: [
          { priceDeltaCents: 100 },
          { priceDeltaCents: 200 },
          { priceDeltaCents: 50 },
        ],
      })
    ).toBe(1350);
  });

  it("applies a negative priceDeltaCents (removal-style addition) as a reduction", () => {
    expect(
      resolveLineItemPrice({
        basePriceCents: 1000,
        additions: [{ priceDeltaCents: -150 }],
      })
    ).toBe(850);
  });

  it("treats an empty additions array the same as no additions", () => {
    expect(
      resolveLineItemPrice({
        basePriceCents: 1000,
        additions: [],
      })
    ).toBe(1000);
  });

  it("falls back to basePriceCents when size is explicitly null", () => {
    expect(
      resolveLineItemPrice({
        basePriceCents: 1000,
        size: null,
      })
    ).toBe(1000);
  });

  it("combines size price as base with additions layered on top", () => {
    expect(
      resolveLineItemPrice({
        basePriceCents: 1000,
        size: { priceCents: 1500 },
        additions: [
          { priceDeltaCents: 200 },
          { priceDeltaCents: -50 },
        ],
      })
    ).toBe(1650);
  });
});
