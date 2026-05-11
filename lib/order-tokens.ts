/**
 * Signed self-service tokens for guest order operations (currently
 * just cancel-and-refund — could grow to cover modify, view-receipt,
 * etc. in the future).
 *
 * Why this exists: the checkout flow accepts guest orders (no parent
 * account required at the time of payment). After Stripe redirects
 * back to /checkout/success, a guest customer who clicks "Cancel
 * order & refund" has no session to authenticate against. Previously
 * the cancel API returned 401 "Unauthorized" — a dead end.
 *
 * Design choices:
 *  - HMAC, not JWT. We don't need claims, we need integrity. SHA-256
 *    HMAC over `${orderId}|${expiresAt}` keyed with NEXTAUTH_SECRET.
 *  - Token is minted server-side on the success page and handed to the
 *    client component. The client sends it back in the cancel POST.
 *    Stays out of the URL so it doesn't leak via referrer / browser
 *    history / log files.
 *  - 30-day expiry is generous. The real ceiling is
 *    `deliveryDate.cutoffAt` — cancelOrderWithRefund refuses to cancel
 *    after cutoff regardless of token validity.
 *  - Constant-time signature comparison via `crypto.timingSafeEqual`.
 *  - Token version prefix (`v1`) lets us rotate the format later
 *    without server-side stamps.
 */

import crypto from "node:crypto";
import { env } from "@/lib/env";

const TOKEN_VERSION = "v1";

/** 30 days is intentionally generous — cancelOrderWithRefund already
 *  refuses to act after the delivery's cutoff, which is the meaningful
 *  business constraint. The 30-day window just means a guest who reopens
 *  their confirmation email a week later can still hit Cancel without
 *  having to sign in. */
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for order tokens.");
  return secret;
}

function toB64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Sign a cancel-order token. Returns an opaque string the client can
 * hand back to the cancel API. The token binds to a specific orderId so
 * a leaked token for order A can't cancel order B.
 */
export function signOrderCancelToken(orderId: string, ttlMs = DEFAULT_TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${TOKEN_VERSION}|${orderId}|${expiresAt}`;
  const hmac = crypto.createHmac("sha256", getSecret()).update(payload).digest();
  return `${toB64Url(payload)}.${toB64Url(hmac)}`;
}

/**
 * Verify a cancel-order token against an expected orderId. Returns true
 * only when:
 *   - The signature matches (constant-time)
 *   - The payload version is supported
 *   - The orderId in the payload matches the expected orderId
 *   - The expiry hasn't passed
 *
 * Any other failure (malformed input, base64 errors, mismatched length)
 * returns false silently — we don't want to leak the failure mode to
 * a probing client.
 */
export function verifyOrderCancelToken(token: string, expectedOrderId: string): boolean {
  if (!token || typeof token !== "string") return false;

  const idx = token.indexOf(".");
  if (idx <= 0 || idx >= token.length - 1) return false;
  const payloadEnc = token.slice(0, idx);
  const sigEnc = token.slice(idx + 1);

  let payload: string;
  let providedHmac: Buffer;
  try {
    payload = Buffer.from(payloadEnc, "base64url").toString();
    providedHmac = Buffer.from(sigEnc, "base64url");
  } catch {
    return false;
  }

  const expectedHmac = crypto.createHmac("sha256", getSecret()).update(payload).digest();
  if (providedHmac.length !== expectedHmac.length) return false;
  if (!crypto.timingSafeEqual(providedHmac, expectedHmac)) return false;

  const parts = payload.split("|");
  if (parts.length !== 3) return false;
  const [version, orderId, expiresAtStr] = parts;
  if (version !== TOKEN_VERSION) return false;
  if (orderId !== expectedOrderId) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}
