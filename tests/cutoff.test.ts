import { describe, expect, it } from "vitest";
import { assertOrderingOpen, getCutoffErrorMessage } from "@/lib/orders";

describe("cutoff validation", () => {
  it("allows ordering before cutoff", () => {
    expect(() =>
      assertOrderingOpen(
        new Date("2026-04-01T22:00:00.000Z"),
        new Date("2026-04-02T00:00:00.000Z"),
        new Date("2026-04-02T19:00:00.000Z"),
        "America/Los_Angeles"
      )
    ).not.toThrow();
  });

  it("blocks ordering after cutoff with a clear message", () => {
    const now = new Date("2026-04-02T00:01:00.000Z");
    const cutoffAt = new Date("2026-04-02T00:00:00.000Z");
    const deliveryDate = new Date("2026-04-02T19:00:00.000Z");

    expect(() => assertOrderingOpen(now, cutoffAt, deliveryDate, "America/Los_Angeles")).toThrow(
      getCutoffErrorMessage(deliveryDate, cutoffAt, "America/Los_Angeles")
    );
  });
});
