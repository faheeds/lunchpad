import { describe, expect, it } from "vitest";
import { normalizeStudentName, PARENT_CHECKOUT_TTL_SECONDS } from "@/lib/pending-orders";

describe("pending-orders helpers", () => {
  it("matches student names ignoring case, edge and repeated whitespace", () => {
    expect(normalizeStudentName("Malek Abu-Abed ")).toBe("malek abu-abed");
    expect(normalizeStudentName("  Hafsa   Ahmad")).toBe("hafsa ahmad");
    expect(normalizeStudentName(null)).toBe("");
  });

  it("keeps parent checkout sessions above Stripe's 30 minute minimum", () => {
    expect(PARENT_CHECKOUT_TTL_SECONDS).toBeGreaterThanOrEqual(30 * 60);
  });
});
