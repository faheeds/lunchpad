/**
 * Helper: verify a native-app Bearer JWT from the Authorization header.
 * Accepts both the short-lived WebView handoff tokens (mobile-jwt.ts)
 * and the long-lived native app tokens (native-jwt.ts).
 */

import { verifyMobileToken, MobileTokenPayload } from "./mobile-jwt";
import { verifyNativeToken } from "./native-jwt";

export type MobileAuth = MobileTokenPayload;

export async function getMobileAuth(
  request: Request
): Promise<MobileAuth | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  // Try long-lived native token first, fall back to short-lived handoff token
  try {
    return await verifyNativeToken(token);
  } catch {
    try {
      return await verifyMobileToken(token);
    } catch {
      return null;
    }
  }
}

export async function requireMobileAuth(request: Request): Promise<MobileAuth> {
  const payload = await getMobileAuth(request);
  if (!payload) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return payload;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function options() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function jsonOk(data: unknown) {
  return Response.json(data, { headers: CORS_HEADERS });
}

export function jsonErr(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: CORS_HEADERS });
}
