import { describe, expect, it } from "vitest";
import { classifyReorderItem } from "@/lib/reorder-classify";

// Pure function — no mocks needed.

describe("classifyReorderItem", () => {
  // ── Happy paths: null (can auto-clone) ──────────────────────────────────────

  it("null: available, no required choices, no sizes", () => {
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: [],
        capturedChoice: undefined,
        hasSizes: false,
        capturedSize: null,
      })
    ).toBeNull();
  });

  it("null: available, required choice captured, no sizes", () => {
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: ["sauce"],
        capturedChoice: "ranch",
        hasSizes: false,
        capturedSize: null,
      })
    ).toBeNull();
  });

  it("null: available, no required choices, has sizes and size captured", () => {
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: [],
        capturedChoice: undefined,
        hasSizes: true,
        capturedSize: "Large",
      })
    ).toBeNull();
  });

  it("null: available, required choice captured AND size captured", () => {
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: ["protein"],
        capturedChoice: "chicken",
        hasSizes: true,
        capturedSize: "Regular",
      })
    ).toBeNull();
  });

  // ── not_on_menu ──────────────────────────────────────────────────────────────

  it("not_on_menu: available=false with no other blockers", () => {
    expect(
      classifyReorderItem({
        available: false,
        requiredChoices: [],
        capturedChoice: undefined,
        hasSizes: false,
        capturedSize: null,
      })
    ).toBe("not_on_menu");
  });

  // ── needs_selection ──────────────────────────────────────────────────────────

  it("needs_selection: available, requiredChoices present, capturedChoice undefined", () => {
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: ["size"],
        capturedChoice: undefined,
        hasSizes: false,
        capturedSize: null,
      })
    ).toBe("needs_selection");
  });

  it("needs_selection: available, no required choices, hasSizes=true and capturedSize=null", () => {
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: [],
        capturedChoice: undefined,
        hasSizes: true,
        capturedSize: null,
      })
    ).toBe("needs_selection");
  });

  // ── Adversarial ───────────────────────────────────────────────────────────────

  it("adversarial: available=false with needs-selection conditions → not_on_menu (not_on_menu wins)", () => {
    // Even if required choices are missing and sizes are absent, unavailability takes priority.
    expect(
      classifyReorderItem({
        available: false,
        requiredChoices: ["sauce"],
        capturedChoice: undefined,
        hasSizes: true,
        capturedSize: null,
      })
    ).toBe("not_on_menu");
  });

  it("adversarial: empty requiredChoices with capturedChoice=undefined → null (no false positive)", () => {
    // requiredChoices.length === 0, so the required-choice branch must not fire.
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: [],
        capturedChoice: undefined,
        hasSizes: false,
        capturedSize: null,
      })
    ).toBeNull();
  });

  it("adversarial: hasSizes=true with capturedSize='' (empty string) → needs_selection", () => {
    // Empty string is falsy — treated as no size captured.
    expect(
      classifyReorderItem({
        available: true,
        requiredChoices: [],
        capturedChoice: undefined,
        hasSizes: true,
        capturedSize: "",
      })
    ).toBe("needs_selection");
  });
});
