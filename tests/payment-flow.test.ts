import { describe, expect, it } from "vitest";
import { buildPaidState } from "@/lib/orders";

describe("successful paid order state", () => {
  it("builds the paid state used after checkout success", () => {
    const paidAt = new Date("2026-04-01T18:00:00.000Z");
    expect(buildPaidState(paidAt)).toEqual({
      orderStatus: "PAID",
      paymentStatus: "PAID",
      paidAt
    });
  });
});
