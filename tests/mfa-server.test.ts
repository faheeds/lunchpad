/**
 * Unit tests for lib/mfa-server.ts — the in-memory per-admin enrollment
 * rate limiter for Phase 2.
 *
 * Ground rules:
 *   - Fake timers everywhere time matters. No real sleeps.
 *   - We reset the module between tests via vi.resetModules() so the
 *     module-scoped Map (which holds all bucket state) starts fresh
 *     for each test. Cross-test bleed would make lockout tests order-
 *     dependent.
 *   - We use the constants declared in the source (WINDOW_MS,
 *     MAX_ATTEMPTS, LOCKOUT_MS = 15 minutes / 5 / 15 minutes) as ground
 *     truth. If the source is retuned, tests will fail loudly and the
 *     limits are re-verified deliberately.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import a fresh copy of the module per test so the internal Map<> starts
// empty. The alternative (mutating internal state) isn't possible from
// outside — the Map isn't exported.
async function freshLimiter() {
  vi.resetModules();
  return await import("@/lib/mfa-server");
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

describe("checkEnrollmentRateLimit / recordEnrollmentFailure / clearEnrollmentAttempts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fresh admin: check returns { ok: true } with no bucket yet", async () => {
    const { checkEnrollmentRateLimit } = await freshLimiter();
    const result = checkEnrollmentRateLimit("brand-new-admin");
    expect(result).toEqual({ ok: true });
  });

  it("after 4 failures: check still returns { ok: true }", async () => {
    const { checkEnrollmentRateLimit, recordEnrollmentFailure } = await freshLimiter();
    for (let i = 0; i < 4; i++) {
      recordEnrollmentFailure("admin-A");
    }
    expect(checkEnrollmentRateLimit("admin-A")).toEqual({ ok: true });
  });

  it("after 5 failures: check returns { ok: false, retryAfterMs }", async () => {
    const { checkEnrollmentRateLimit, recordEnrollmentFailure } = await freshLimiter();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      recordEnrollmentFailure("admin-B");
    }
    const result = checkEnrollmentRateLimit("admin-B");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // retryAfterMs should be within (0, LOCKOUT_MS]
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(LOCKOUT_MS);
    }
  });

  it("locked-out admin recovers once the lockout window elapses", async () => {
    const { checkEnrollmentRateLimit, recordEnrollmentFailure } = await freshLimiter();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      recordEnrollmentFailure("admin-C");
    }
    expect(checkEnrollmentRateLimit("admin-C").ok).toBe(false);

    // Advance the clock just past LOCKOUT_MS. The bucket's lockedUntil
    // should have expired and the check should clear the lockout.
    vi.advanceTimersByTime(LOCKOUT_MS + 1);
    expect(checkEnrollmentRateLimit("admin-C")).toEqual({ ok: true });

    // After recovery, a single new failure must NOT immediately re-lock —
    // the failure list was cleared. Only when this admin accumulates
    // MAX_ATTEMPTS more failures should they lock out again.
    recordEnrollmentFailure("admin-C");
    expect(checkEnrollmentRateLimit("admin-C")).toEqual({ ok: true });
  });

  it("clearEnrollmentAttempts resets the bucket: 3 failures → clear → does NOT lock until 5 fresh failures", async () => {
    const { checkEnrollmentRateLimit, recordEnrollmentFailure, clearEnrollmentAttempts } =
      await freshLimiter();

    for (let i = 0; i < 3; i++) {
      recordEnrollmentFailure("admin-D");
    }
    clearEnrollmentAttempts("admin-D");

    // 4 fresh failures — still allowed.
    for (let i = 0; i < 4; i++) {
      recordEnrollmentFailure("admin-D");
    }
    expect(checkEnrollmentRateLimit("admin-D")).toEqual({ ok: true });

    // 5th fresh failure — NOW locked out.
    recordEnrollmentFailure("admin-D");
    expect(checkEnrollmentRateLimit("admin-D").ok).toBe(false);
  });

  it("admins are isolated: admin A locked out does not affect admin B", async () => {
    const { checkEnrollmentRateLimit, recordEnrollmentFailure } = await freshLimiter();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      recordEnrollmentFailure("admin-A");
    }
    expect(checkEnrollmentRateLimit("admin-A").ok).toBe(false);
    expect(checkEnrollmentRateLimit("admin-B")).toEqual({ ok: true });

    // A few failures on B do not affect A (already locked) and vice versa.
    for (let i = 0; i < 2; i++) {
      recordEnrollmentFailure("admin-B");
    }
    expect(checkEnrollmentRateLimit("admin-B")).toEqual({ ok: true });
    expect(checkEnrollmentRateLimit("admin-A").ok).toBe(false);
  });

  it("attempts age out of the rolling window: 4 failures then WINDOW_MS elapses → 4 fresh failures still don't lock", async () => {
    // Source drops failures older than WINDOW_MS on each recordEnrollmentFailure
    // call, so old attempts stop counting toward the MAX_ATTEMPTS threshold
    // even if the bucket is never cleared explicitly.
    const { checkEnrollmentRateLimit, recordEnrollmentFailure } = await freshLimiter();

    for (let i = 0; i < 4; i++) {
      recordEnrollmentFailure("admin-E");
    }
    // Wait past the window so those first 4 no longer count.
    vi.advanceTimersByTime(WINDOW_MS + 1);

    // 4 more failures land after the window — total logical count is 4,
    // not 8, so we should still be allowed.
    for (let i = 0; i < 4; i++) {
      recordEnrollmentFailure("admin-E");
    }
    expect(checkEnrollmentRateLimit("admin-E")).toEqual({ ok: true });

    // A 5th fresh failure inside the current window WOULD lock.
    recordEnrollmentFailure("admin-E");
    expect(checkEnrollmentRateLimit("admin-E").ok).toBe(false);
  });

  it("retryAfterMs shrinks as time passes toward the lockout expiry", async () => {
    const { checkEnrollmentRateLimit, recordEnrollmentFailure } = await freshLimiter();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      recordEnrollmentFailure("admin-F");
    }
    const first = checkEnrollmentRateLimit("admin-F");
    expect(first.ok).toBe(false);

    vi.advanceTimersByTime(60_000); // 1 minute in
    const second = checkEnrollmentRateLimit("admin-F");
    expect(second.ok).toBe(false);

    if (!first.ok && !second.ok) {
      expect(second.retryAfterMs).toBeLessThan(first.retryAfterMs);
    }
  });

  it("clearEnrollmentAttempts on a fresh (unknown) admin is a no-op", async () => {
    const { checkEnrollmentRateLimit, clearEnrollmentAttempts } = await freshLimiter();
    // Should not throw.
    clearEnrollmentAttempts("never-seen");
    expect(checkEnrollmentRateLimit("never-seen")).toEqual({ ok: true });
  });
});
