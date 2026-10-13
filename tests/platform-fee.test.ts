import { describe, expect, it } from "vitest";
import { computePlatformFeeCents } from "@/lib/payments/platform-fee";

// Stripe cost to the platform on a destination charge in WA (worst-case 10.3% tax):
// 2.9% + 30c on the taxed total, plus Stripe Tax 0.5% of the taxed total.
function stripeCostCents(netCents: number, taxRate = 0.103) {
  const gross = netCents * (1 + taxRate);
  return gross * 0.029 + 30 + gross * 0.005;
}

describe("computePlatformFeeCents", () => {
  it("covers Stripe's cost on typical lunch tickets at the default rate", () => {
    for (const net of [699, 999, 1400, 1799, 2698, 5000]) {
      expect(computePlatformFeeCents(net)).toBeGreaterThanOrEqual(Math.floor(stripeCostCents(net)));
    }
  });

  it("includes the flat component on small orders", () => {
    expect(computePlatformFeeCents(400, 0, 30)).toBe(30);
    expect(computePlatformFeeCents(1400, 3.8, 30)).toBe(83);
  });

  it("never exceeds the net and never charges on a zero order", () => {
    expect(computePlatformFeeCents(20, 3.8, 30)).toBe(20);
    expect(computePlatformFeeCents(0)).toBe(0);
  });
});
