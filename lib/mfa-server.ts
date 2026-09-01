/**
 * Server-only MFA helpers.
 *
 * Keeps `lib/mfa.ts` pure (crypto only, no state, no DB). Things that need
 * process-local state or would otherwise pollute the crypto module live here.
 *
 * Current contents:
 *   - `checkEnrollmentRateLimit()` — coarse per-admin brute-force guard on
 *     confirmEnrollment. In-memory map keyed by adminUserId; TTL 15 minutes;
 *     locks the admin out for 15 minutes after 5 failures in that window.
 *
 * IMPORTANT: this rate limiter lives in a module-scoped Map, so it is
 * per-serverless-instance. On Vercel that means an attacker who hits many
 * cold instances can burn many attempt buckets. That's acceptable for
 * phase 2 (enrollment already requires a valid session and only lets a
 * user brute-force their OWN account), but the moment we start rate-
 * limiting the login TOTP check (phase 3) this needs to move to a shared
 * store (Redis / Vercel KV / the DB) so the counter is durable across
 * cold starts. TODO before phase 3.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

type Bucket = {
  // Timestamps of failed attempts inside the current window. We prune the
  // array on every check so it stays bounded at MAX_ATTEMPTS-ish entries.
  failures: number[];
  // Absolute time until which further attempts are refused. `undefined`
  // means no active lockout.
  lockedUntil?: number;
};

const buckets = new Map<string, Bucket>();

/**
 * Consult the rate limiter for an admin about to attempt a TOTP
 * confirmation. Call BEFORE verifying the code — this checks whether the
 * admin is currently locked out. If the caller then determines the code
 * was invalid, they should call `recordEnrollmentFailure(adminUserId)`.
 * On success, call `clearEnrollmentAttempts(adminUserId)` to wipe the
 * bucket.
 *
 * Returns `{ ok: true }` when the attempt is allowed, or
 * `{ ok: false, retryAfterMs }` when the caller must refuse.
 */
export function checkEnrollmentRateLimit(
  adminUserId: string,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(adminUserId);
  if (!bucket) return { ok: true };

  if (bucket.lockedUntil && bucket.lockedUntil > now) {
    return { ok: false, retryAfterMs: bucket.lockedUntil - now };
  }

  // If we're past the lockout window, clear it so the user can try again.
  if (bucket.lockedUntil && bucket.lockedUntil <= now) {
    bucket.lockedUntil = undefined;
    bucket.failures = [];
  }

  return { ok: true };
}

/**
 * Record a failed enrollment confirmation attempt. If the admin has now
 * hit MAX_ATTEMPTS inside the rolling WINDOW_MS window, engage a
 * LOCKOUT_MS cooldown.
 */
export function recordEnrollmentFailure(adminUserId: string): void {
  const now = Date.now();
  const bucket = buckets.get(adminUserId) ?? { failures: [] };
  // Drop any failures older than the window; they no longer count.
  bucket.failures = bucket.failures.filter((t) => now - t < WINDOW_MS);
  bucket.failures.push(now);
  if (bucket.failures.length >= MAX_ATTEMPTS) {
    bucket.lockedUntil = now + LOCKOUT_MS;
  }
  buckets.set(adminUserId, bucket);
}

/**
 * Clear the rate-limit bucket for an admin — call after a successful
 * confirmEnrollment so a legitimate user who fat-fingered a code four
 * times isn't penalized on their next enrollment attempt.
 */
export function clearEnrollmentAttempts(adminUserId: string): void {
  buckets.delete(adminUserId);
}
