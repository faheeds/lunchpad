import { describe, it, expect } from "vitest";
import { buildPaymentInstructionLines } from "@/lib/payments/offline-instructions";

describe("buildPaymentInstructionLines", () => {
  it("gives Zelle instructions with the handle and a memo reminder", () => {
    const lines = buildPaymentInstructionLines({ method: "zelle", totalCents: 4250, zelleHandle: "555-123-4567" });
    expect(lines[0]).toContain("$42.50");
    expect(lines[0]).toContain("555-123-4567");
    expect(lines[1]).toMatch(/order number/i);
  });

  it("falls back gracefully when no Zelle handle is set", () => {
    const lines = buildPaymentInstructionLines({ method: "zelle", totalCents: 1000 });
    expect(lines[0]).toContain("$10.00");
    expect(lines[0]).not.toContain("null");
  });

  it("gives cash instructions", () => {
    const lines = buildPaymentInstructionLines({ method: "cash", totalCents: 2000 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/cash/i);
  });

  it("appends the operator's extra instructions when present", () => {
    const lines = buildPaymentInstructionLines({ method: "cash", totalCents: 500, instructions: "  Pay within 24h.  " });
    expect(lines.at(-1)).toBe("Pay within 24h.");
  });
});
