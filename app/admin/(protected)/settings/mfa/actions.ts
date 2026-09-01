"use server";

/**
 * MFA / TOTP enrollment server actions.
 *
 * Design invariants — every action in this file follows these rules:
 *
 * 1. Tenant scoping: the AdminUser being mutated is ALWAYS resolved by
 *    (session.adminUserId, session.restaurantId). We never accept an
 *    adminUserId from the client — the session is the sole source of
 *    truth for "which admin is this". This is the single most likely
 *    place a cross-tenant bug could slip in.
 *
 * 2. Atomicity: writes that combine multiple rows (AdminUser + recovery
 *    codes) run inside a single `prisma.$transaction` so we can never
 *    end up with, say, an enabled MFA row and no recovery codes.
 *
 * 3. No secret leakage: plaintext TOTP secrets and plaintext recovery
 *    codes must never be logged. Errors thrown from these actions are
 *    intentionally generic strings.
 *
 * 4. OWNER lockout: OWNER accounts cannot self-disable MFA. The check
 *    is a *policy* short-circuit that runs BEFORE the bcrypt password
 *    verify — a wrong password from an OWNER trying to disable should
 *    return the same OWNER-refusal message as a correct password, so
 *    we don't leak which case they're in.
 *
 * 5. Rate limiting: confirmEnrollment consults an in-memory per-admin
 *    rate limiter (see lib/mfa-server.ts). If a shared-cache limiter
 *    isn't available in this codebase we accept the per-instance
 *    weakness for phase 2 and TODO tighten it before phase 3.
 */

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import {
  generateTotpSecret,
  generateOtpauthUrl,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
} from "@/lib/mfa";
import {
  checkEnrollmentRateLimit,
  recordEnrollmentFailure,
  clearEnrollmentAttempts,
} from "@/lib/mfa-server";

// Generic error messages — deliberately non-specific so a caller can't
// infer server-side state (e.g. "is this admin enrolled?") from the
// distinct wording of an error string.
const ERR_UNAUTHENTICATED = "Not authenticated.";
const ERR_GENERIC = "Something went wrong. Please try again.";
const ERR_INVALID_CODE = "That code didn't match. Try again.";
const ERR_RATE_LIMITED = "Too many failed attempts. Please wait a few minutes and try again.";
const ERR_OWNER_CANNOT_DISABLE =
  "OWNER accounts are required to keep 2FA enabled. Ask another OWNER to promote you first if you need to disable.";
const ERR_INVALID_PASSWORD = "Password is incorrect.";
const ERR_NOT_ENROLLED = "2FA is not enabled on this account.";

/**
 * Resolve and validate the current admin from the session. Always
 * pulls the AdminUser row fresh from the DB — the JWT could be stale
 * with respect to MFA fields, and we never trust the client. Returns
 * both the session and the DB row.
 *
 * The `where` clause is `{ id: session.adminUserId, restaurantId: session.restaurantId }`
 * — both fields from the session, neither from client input. If the
 * session lacks either field we bail with a generic "not authenticated"
 * error.
 */
async function loadSelfAdmin() {
  const session = await requireAdmin();
  const adminUserId = session.user?.adminUserId;
  const restaurantId = session.user?.restaurantId;
  if (!adminUserId || !restaurantId) {
    throw new Error(ERR_UNAUTHENTICATED);
  }
  const admin = await prisma.adminUser.findFirst({
    where: { id: adminUserId, restaurantId },
  });
  if (!admin) {
    throw new Error(ERR_UNAUTHENTICATED);
  }
  return { session, admin, adminUserId, restaurantId };
}

// ─── startEnrollment ────────────────────────────────────────────────────────

/**
 * Kick off enrollment. Generates a fresh TOTP secret and the otpauth://
 * URL the authenticator app will scan. **The secret is NOT saved to the
 * DB here** — it's held in client memory between startEnrollment and
 * confirmEnrollment. This mirrors the pattern used by GitHub / Stripe /
 * every mainstream TOTP flow: enrollment is a two-round trip, and the
 * server only commits state once the user has proven they can produce
 * a valid code from the secret they scanned.
 *
 * We include the admin's email in the otpauth account label and the
 * restaurant slug in the issuer so the authenticator app shows a
 * disambiguated entry (matters when the same person admins multiple
 * LunchPad tenants).
 *
 * Refuses if the caller is already enrolled — the caller should have
 * routed them to the "manage" flow instead. This isn't a security
 * boundary (they could just regenerate on their own account) but keeps
 * UX honest and avoids the ambiguity of "we started enrollment but
 * you're already enrolled".
 */
export async function startEnrollment(): Promise<{ secret: string; otpauthUrl: string }> {
  const { admin, restaurantId } = await loadSelfAdmin();

  if (admin.mfaEnabledAt && admin.mfaSecretEnc) {
    // Already enrolled — tell the client to route to manage instead.
    throw new Error("2FA is already enabled on this account.");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { slug: true, name: true },
  });
  if (!restaurant) throw new Error(ERR_GENERIC);

  const secret = generateTotpSecret();
  // Issuer format follows what authenticator apps display; keeping the
  // brand + tenant slug helps a user with multiple LunchPad accounts
  // tell them apart in Google Authenticator / 1Password / etc.
  const issuer = `LunchPad — ${restaurant.slug}`;
  const otpauthUrl = generateOtpauthUrl(secret, admin.email, issuer);

  return { secret, otpauthUrl };
}

// ─── confirmEnrollment ─────────────────────────────────────────────────────

/**
 * Complete enrollment by verifying the user can produce a code from the
 * secret we handed them in startEnrollment. On success:
 *   1. encrypt the secret
 *   2. generate 10 recovery codes (plaintext returned to caller, hashes
 *      stored server-side)
 *   3. inside a single $transaction:
 *        - update AdminUser: mfaSecretEnc, mfaEnabledAt=now, mfaEnrolledAt=now
 *        - delete any pre-existing recovery codes for this admin
 *        - insert the 10 new code hashes
 *
 * The transaction is the atomicity guarantee: we never want to end up
 * with a saved secret but no codes, or codes without a secret.
 *
 * The plaintext recovery codes returned here are the ONLY time they
 * exist client-side after this call. The client is responsible for
 * showing them to the user and forcing the "I've saved these" flow
 * before dismissing. They cannot be re-fetched.
 *
 * Rate-limited via in-memory bucket (see lib/mfa-server.ts): 5 failures
 * in 15 minutes → 15-minute lockout. Failed-code branch does NOT reveal
 * which failure count the admin is on (would be a fingerprinting leak).
 */
export async function confirmEnrollment(
  secret: string,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  const { admin, adminUserId, restaurantId } = await loadSelfAdmin();

  // Rate-limit check BEFORE any crypto work so a locked-out attacker
  // can't use the response time to distinguish "wrong code" from "locked".
  const rl = checkEnrollmentRateLimit(adminUserId);
  if (!rl.ok) {
    throw new Error(ERR_RATE_LIMITED);
  }

  if (typeof secret !== "string" || !secret) {
    // Malformed client input — count as a failure so a client that
    // repeatedly submits garbage still trips the rate limiter.
    recordEnrollmentFailure(adminUserId);
    throw new Error(ERR_INVALID_CODE);
  }

  if (!verifyTotpCode(secret, code)) {
    recordEnrollmentFailure(adminUserId);
    throw new Error(ERR_INVALID_CODE);
  }

  const encrypted = encryptTotpSecret(secret);
  const { plaintext, hashes } = generateRecoveryCodes(10);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Re-check tenant scoping inside the tx — belt-and-braces against
    // the (impossible today, but cheap to defend) case where the admin
    // was moved to another tenant between loadSelfAdmin and here.
    const target = await tx.adminUser.findFirst({
      where: { id: adminUserId, restaurantId },
      select: { id: true },
    });
    if (!target) throw new Error(ERR_UNAUTHENTICATED);

    await tx.adminUser.update({
      where: { id: adminUserId },
      data: {
        mfaSecretEnc: encrypted,
        mfaEnabledAt: now,
        // Only set mfaEnrolledAt on the *first* enrollment. Preserves
        // the "when did this account first complete MFA" history if
        // they disable and re-enable later.
        mfaEnrolledAt: admin.mfaEnrolledAt ?? now,
      },
    });

    // Wipe any prior codes (e.g. from a previous enrollment that was
    // later disabled). Then insert the fresh batch.
    await tx.adminRecoveryCode.deleteMany({ where: { adminUserId } });
    await tx.adminRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ adminUserId, codeHash })),
    });
  });

  clearEnrollmentAttempts(adminUserId);

  // NOTE: not writing to activity log yet — the current ActivityAction /
  // ActivityEntityType enums don't include MFA-specific values, and
  // widening those types crosses lane lines for this PR (they're used
  // across many files). Phase 3 or a follow-up should add MFA_ENABLED /
  // MFA_DISABLED / MFA_RECOVERY_CODES_REGENERATED actions and an
  // ADMIN_USER entity type, then wire logActivity() calls into all
  // three MFA actions here.

  revalidatePath("/admin/settings/mfa");
  revalidatePath("/admin/team");

  return { recoveryCodes: plaintext };
}

// ─── regenerateRecoveryCodes ───────────────────────────────────────────────

/**
 * Issue a fresh batch of 10 recovery codes, invalidating any prior
 * codes. Requires the caller to present a valid TOTP code from their
 * currently-enrolled authenticator — this is the proof-of-possession
 * of the second factor that lets us confidently rotate codes without
 * an email confirmation or password re-prompt.
 *
 * Order of operations matters:
 *   1. Verify current TOTP (fails fast if not enrolled or code bad)
 *   2. Only then generate new codes and write in a transaction
 *
 * If TOTP verification fails we return the SAME generic error whether
 * the account is enrolled or not — otherwise the error message
 * fingerprints enrollment state.
 */
export async function regenerateRecoveryCodes(
  totpCode: string,
): Promise<{ recoveryCodes: string[] }> {
  const { admin, adminUserId, restaurantId } = await loadSelfAdmin();

  // Load the current secret. If either field is missing, treat as "code
  // failed" — do not leak that the account isn't enrolled.
  if (!admin.mfaSecretEnc || !admin.mfaEnabledAt) {
    throw new Error(ERR_INVALID_CODE);
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(admin.mfaSecretEnc);
  } catch {
    // Corrupt ciphertext / wrong key — surface generically. If this
    // ever fires in prod it's a real incident and we'd catch it in
    // logs at the crypto layer, not here.
    throw new Error(ERR_GENERIC);
  }

  if (!verifyTotpCode(secret, totpCode)) {
    throw new Error(ERR_INVALID_CODE);
  }

  const { plaintext, hashes } = generateRecoveryCodes(10);

  await prisma.$transaction(async (tx) => {
    // Re-verify tenant scoping inside tx.
    const target = await tx.adminUser.findFirst({
      where: { id: adminUserId, restaurantId },
      select: { id: true },
    });
    if (!target) throw new Error(ERR_UNAUTHENTICATED);

    await tx.adminRecoveryCode.deleteMany({ where: { adminUserId } });
    await tx.adminRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ adminUserId, codeHash })),
    });
  });

  revalidatePath("/admin/settings/mfa");

  return { recoveryCodes: plaintext };
}

// ─── disableMfa ────────────────────────────────────────────────────────────

/**
 * Disable MFA on the caller's own account. Rules:
 *   - OWNER accounts CANNOT self-disable. Policy check runs FIRST,
 *     before the password check, so a wrong-password attempt from an
 *     OWNER returns the OWNER refusal (they need to know to promote
 *     someone else first, not to fix their password).
 *   - MANAGER / STAFF must supply their current password. We verify
 *     via bcrypt.compare against admin.passwordHash — same pattern as
 *     the credentials login provider.
 *   - On success, atomically clear mfaSecretEnc, mfaEnabledAt,
 *     mfaEnrolledAt, and delete all recovery codes. We deliberately
 *     null out mfaEnrolledAt too so that re-enabling later requires
 *     a fresh full enrollment (no "silent re-enable" surprise).
 *
 * Phase 3 will enforce the OWNER-must-have-MFA rule at login time
 * (the actual absolute enforcement point). Phase 2 just prevents
 * self-disable through this UI.
 */
export async function disableMfa(password: string): Promise<void> {
  const { admin, adminUserId, restaurantId } = await loadSelfAdmin();

  // Policy check FIRST, before any password work. An OWNER trying to
  // disable should see the OWNER refusal regardless of whether their
  // password was correct — the password isn't even checked in this
  // branch.
  if (admin.role === "OWNER") {
    throw new Error(ERR_OWNER_CANNOT_DISABLE);
  }

  if (!admin.mfaEnabledAt || !admin.mfaSecretEnc) {
    // Not enrolled — return generic "not enrolled" rather than a
    // password error, since this is a UX signal not a security one
    // (the account isn't protected by MFA in this state anyway).
    throw new Error(ERR_NOT_ENROLLED);
  }

  if (typeof password !== "string" || password.length === 0) {
    throw new Error(ERR_INVALID_PASSWORD);
  }

  const passwordOk = await bcrypt.compare(password, admin.passwordHash);
  if (!passwordOk) {
    throw new Error(ERR_INVALID_PASSWORD);
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.adminUser.findFirst({
      where: { id: adminUserId, restaurantId },
      select: { id: true, role: true },
    });
    if (!target) throw new Error(ERR_UNAUTHENTICATED);
    // Re-verify the OWNER guard inside the tx in case role changed
    // between loadSelfAdmin and here.
    if (target.role === "OWNER") {
      throw new Error(ERR_OWNER_CANNOT_DISABLE);
    }

    await tx.adminUser.update({
      where: { id: adminUserId },
      data: {
        mfaSecretEnc: null,
        mfaEnabledAt: null,
        mfaEnrolledAt: null,
      },
    });
    await tx.adminRecoveryCode.deleteMany({ where: { adminUserId } });
  });

  revalidatePath("/admin/settings/mfa");
  revalidatePath("/admin/team");
}
