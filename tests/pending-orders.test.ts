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

import { buildAbandonedCheckoutEmail } from "@/lib/email/templates";

describe("buildAbandonedCheckoutEmail", () => {
  it("says no charge was made and links to reorder", () => {
    const m = buildAbandonedCheckoutEmail({
      parentName: "Muna",
      studentName: "Mariam Haq",
      deliveryDate: new Date("2026-10-14T19:00:00Z"),
      timezone: "America/Los_Angeles",
      orderNumber: "SL-20261013-7871",
      restaurantName: "Medina Hot Lunch",
      reorderUrl: "https://medina.lunchpad.us/",
    });
    expect(m.subject).toContain("no charge");
    expect(m.text).toContain("You were not charged");
    expect(m.html).toContain("https://medina.lunchpad.us/");
    expect(m.text).toContain("Mariam Haq");
  });
});
