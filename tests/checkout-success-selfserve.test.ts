import { describe, expect, it } from "vitest";

// Mirrors the inline expression in OrderSelfService:
//   const cutoffPassed = new Date() >= new Date(cutoffAt);
// Extracted here so it can be tested against an injected `now`.
function isCutoffPassed(cutoffAt: string, now: Date): boolean {
  return now >= new Date(cutoffAt);
}

const PAST = "2026-01-01T10:00:00.000Z";
const FUTURE = "2099-12-31T23:59:59.000Z";

describe("isCutoffPassed — OrderSelfService cutoff logic", () => {
  // ── Happy-path ────────────────────────────────────────────────────────────

  it("returns false when now is strictly before cutoff", () => {
    const now = new Date("2026-01-01T09:59:59.999Z");
    expect(isCutoffPassed(PAST, now)).toBe(false);
  });

  it("returns true when now is strictly after cutoff", () => {
    const now = new Date("2026-01-01T10:00:01.000Z");
    expect(isCutoffPassed(PAST, now)).toBe(true);
  });

  it("returns true when now equals cutoff exactly (boundary: >= not >)", () => {
    const cutoff = "2026-06-15T14:00:00.000Z";
    const now = new Date("2026-06-15T14:00:00.000Z");
    expect(isCutoffPassed(cutoff, now)).toBe(true);
  });

  it("returns false for a far-future cutoff", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    expect(isCutoffPassed(FUTURE, now)).toBe(false);
  });

  // ── Adversarial ───────────────────────────────────────────────────────────

  it("adversarial: malformed ISO string → new Date() is NaN → comparison is false", () => {
    // NaN >= NaN is false in JS; component treats unknown cutoff as not-passed.
    // This documents the known edge rather than asserting ideal behavior.
    const now = new Date("2026-07-23T12:00:00.000Z");
    const result = isCutoffPassed("not-a-date", now);
    // NaN comparison always false
    expect(result).toBe(false);
  });

  it("adversarial: empty string cutoffAt → NaN comparison → false", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    expect(isCutoffPassed("", now)).toBe(false);
  });

  it("adversarial: cutoff exactly 1 ms in the future → returns false (not yet passed)", () => {
    const baseMs = Date.now();
    const cutoff = new Date(baseMs + 1).toISOString();
    const now = new Date(baseMs);
    expect(isCutoffPassed(cutoff, now)).toBe(false);
  });

  it("adversarial: cutoff exactly 1 ms in the past → returns true", () => {
    const baseMs = Date.now();
    const cutoff = new Date(baseMs - 1).toISOString();
    const now = new Date(baseMs);
    expect(isCutoffPassed(cutoff, now)).toBe(true);
  });
});
