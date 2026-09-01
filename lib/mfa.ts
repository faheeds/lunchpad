/**
 * MFA / TOTP crypto helpers.
 *
 * Pure crypto — no Prisma, no I/O. This module is the foundation for the
 * three-phase MFA rollout:
 *   Phase 1 (this PR): schema + helpers + env var. No runtime path calls
 *     these functions yet — this file just makes them importable.
 *   Phase 2: /admin/settings enrollment UI wires this up.
 *   Phase 3: login form challenges an enrolled admin for their TOTP code
 *     (or a recovery code) before minting a session.
 *
 * Encryption model:
 *   TOTP secrets are stored as AES-256-GCM ciphertext in AdminUser.mfaSecretEnc.
 *   The wire format is `${ivHex}:${authTagHex}:${ciphertextHex}` — three
 *   colon-separated hex fields. IV is a fresh 12-byte random value on every
 *   encrypt call (never reuse an IV under the same key with GCM). Auth tag
 *   is the 16-byte GCM tag; decrypt fails loudly on tag mismatch, which
 *   protects against ciphertext tampering.
 *
 *   The encryption key comes from env.MFA_ENCRYPTION_KEY — 32 raw bytes
 *   expressed as 64 hex chars. We deliberately do NOT fall back to
 *   NEXTAUTH_SECRET or any other secret: mixing key material across
 *   subsystems means rotating one forces re-encrypting the other, and
 *   losing NEXTAUTH_SECRET would give an attacker MFA plaintexts too.
 *
 * Recovery codes:
 *   Ten single-use codes formatted `XXXXX-XXXXX` (10 alphanumeric chars
 *   with a hyphen at position 5). Shown to the user exactly once at
 *   enrollment. Stored server-side as SHA-256 hex hashes so we can't
 *   read them back. Verification normalizes user input (uppercase, strip
 *   dashes/spaces) so "abcde-12345" and "ABCDE 12345" match the same
 *   stored hash. Comparison is constant-time to defeat timing side
 *   channels. Callers are responsible for marking a matched code as used
 *   (setting AdminRecoveryCode.usedAt) — this module doesn't do DB work.
 *
 * TOTP verification uses a ±1 30-second step window (so the code the
 * user is looking at works even if their phone clock is skewed by up to
 * one step). The full replay defense (rejecting the same code within
 * the current window twice) belongs in the login handler, not here.
 */

import crypto from "node:crypto";
import { authenticator } from "otplib";
import { env } from "@/lib/env";

// ─── TOTP ────────────────────────────────────────────────────────────────────

// otplib defaults: 30-second period, SHA-1, 6-digit codes. We keep those
// defaults for maximum authenticator-app compatibility (Google Authenticator,
// 1Password, Authy, etc all expect them). Tolerate ±1 step for clock drift.
authenticator.options = { window: 1 };

/**
 * Generate a fresh base32-encoded TOTP secret suitable for handing to an
 * authenticator app (via otpauth:// URL / QR code). Length is otplib's
 * default (20 bytes of entropy → ~32 base32 chars), which matches what
 * every mainstream TOTP app expects.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Verify a 6-digit TOTP code against a secret. Tolerates ±1 30-second
 * step for clock drift (so a code the user is looking at right now works
 * even if the server or client clock is up to ~30s off).
 *
 * Returns false on any malformed input — never throws. Rejecting a
 * replayed code within the same step window is the caller's job.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  if (typeof secret !== "string" || !secret) return false;
  if (typeof code !== "string") return false;
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  try {
    return authenticator.check(normalized, secret);
  } catch {
    return false;
  }
}

/**
 * Build the otpauth:// URL an authenticator app scans to enroll. Encoded
 * exactly the way Google/1Password/etc expect: `otpauth://totp/{issuer}:{label}?secret=...&issuer=...`.
 * accountLabel is typically the user's email; issuer identifies the app
 * (e.g. "LunchPad" or "LunchPad — fsskitchen").
 */
export function generateOtpauthUrl(secret: string, accountLabel: string, issuer: string): string {
  return authenticator.keyuri(accountLabel, issuer, secret);
}

// ─── AES-256-GCM secret encryption ───────────────────────────────────────────

const IV_LENGTH = 12; // GCM-recommended IV size (96 bits)
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = env.MFA_ENCRYPTION_KEY;
  if (!hex) throw new Error("MFA_ENCRYPTION_KEY is not set");
  // Zod already validated the format at boot, but re-check to be defensive
  // in case this module is imported before env parsing (e.g. from a script).
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("MFA_ENCRYPTION_KEY is not set");
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a TOTP secret for at-rest storage. Output format is
 * `${ivHex}:${authTagHex}:${ciphertextHex}` — three colon-separated hex
 * fields. A fresh IV is generated per call so encrypting the same
 * plaintext twice yields two different ciphertexts (GCM is malleable
 * under IV reuse — never reuse an IV with the same key).
 *
 * Throws `MFA_ENCRYPTION_KEY is not set` when the env var is missing.
 */
export function encryptTotpSecret(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptTotpSecret: plaintext must be a non-empty string");
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a TOTP secret previously produced by encryptTotpSecret. Throws
 * on any of: missing key, malformed input, ciphertext tampering (GCM auth
 * tag mismatch), or wrong key. We intentionally do NOT swallow errors —
 * a decrypt failure means either a bug or a security incident, and
 * either way the caller must not silently proceed as if the secret were
 * valid.
 */
export function decryptTotpSecret(ciphertext: string): string {
  if (typeof ciphertext !== "string" || !ciphertext) {
    throw new Error("decryptTotpSecret: ciphertext must be a non-empty string");
  }
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("decryptTotpSecret: malformed ciphertext (expected iv:authTag:data)");
  }
  const [ivHex, authTagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || data.length === 0) {
    throw new Error("decryptTotpSecret: malformed ciphertext (bad field lengths)");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

// Crockford-ish alphabet: drops the visually ambiguous 0/O and 1/I/L so
// users transcribing codes from a printed sheet don't fat-finger them.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_GROUP_LENGTH = 5;
const RECOVERY_GROUPS = 2;
const RECOVERY_DEFAULT_COUNT = 10;

function pickRecoveryChar(): string {
  // rejection sampling to keep the distribution uniform (256 % 31 != 0).
  // At 256 possibilities and 31 buckets, ~2.7% of samples are rejected —
  // negligible for a 10-char code.
  const max = 256 - (256 % RECOVERY_ALPHABET.length);
  // Bounded loop: at ~2.7% rejection rate the chance of >100 iterations is
  // vanishingly small (~2.7^100). Hard cap defends against a broken RNG.
  for (let i = 0; i < 1000; i++) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < max) return RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
  }
  throw new Error("generateRecoveryCodes: RNG rejection sampling exhausted (broken crypto?)");
}

function generateSingleRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_GROUPS; g++) {
    let group = "";
    for (let c = 0; c < RECOVERY_GROUP_LENGTH; c++) group += pickRecoveryChar();
    groups.push(group);
  }
  return groups.join("-");
}

/**
 * Normalize a recovery code for hashing / comparison. Uppercase, strip
 * dashes AND whitespace. This lets a user paste "abcde-12345",
 * "ABCDE12345", "abcde 12345", or "  ABCDE-12345\n" and have them all
 * hash to the same value.
 */
function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * Compute the storable SHA-256 hex hash of a recovery code. Input is
 * normalized first so "abcde-12345" and "ABCDE12345" hash identically.
 */
export function hashRecoveryCode(code: string): string {
  if (typeof code !== "string") throw new Error("hashRecoveryCode: code must be a string");
  const normalized = normalizeRecoveryCode(code);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Generate a fresh batch of recovery codes. Default 10, formatted
 * `XXXXX-XXXXX` from a reduced alphabet (no 0/O/1/I/L to avoid
 * transcription errors). Returns both the plaintext (to show the user
 * once) and the hashes (to store server-side). The two arrays are
 * index-aligned: plaintext[i] hashes to hashes[i].
 */
export function generateRecoveryCodes(
  count: number = RECOVERY_DEFAULT_COUNT,
): { plaintext: string[]; hashes: string[] } {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error("generateRecoveryCodes: count must be an integer between 1 and 50");
  }
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = generateSingleRecoveryCode();
    plaintext.push(code);
    hashes.push(hashRecoveryCode(code));
  }
  return { plaintext, hashes };
}

/**
 * Look up a user-supplied recovery code in a list of stored hashes.
 * Returns { matchIndex } if any hash matches, else null. Uses constant-
 * time comparison for every hash in the list so the response time
 * doesn't leak which position matched (or that no match was found).
 *
 * IMPORTANT: this function does NOT mark the code as used. The caller
 * must update AdminRecoveryCode.usedAt inside the same DB transaction
 * that mints the session, so a concurrent attacker can't race two
 * requests with the same code and get both to succeed.
 */
export function verifyRecoveryCode(
  input: string,
  hashes: string[],
): { matchIndex: number } | null {
  if (typeof input !== "string" || !input) return null;
  if (!Array.isArray(hashes) || hashes.length === 0) return null;

  const inputHash = Buffer.from(hashRecoveryCode(input), "hex");
  let matchIndex = -1;

  // Always iterate the full list — even after finding a match — so the
  // total work is independent of the match position.
  for (let i = 0; i < hashes.length; i++) {
    const stored = hashes[i];
    if (typeof stored !== "string" || stored.length !== inputHash.length * 2) continue;
    let storedBuf: Buffer;
    try {
      storedBuf = Buffer.from(stored, "hex");
    } catch {
      continue;
    }
    if (storedBuf.length !== inputHash.length) continue;
    if (crypto.timingSafeEqual(inputHash, storedBuf) && matchIndex === -1) {
      matchIndex = i;
    }
  }

  return matchIndex === -1 ? null : { matchIndex };
}
