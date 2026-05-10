/**
 * Helper: verify a native-app Bearer JWT from the Authorization header.
 * Accepts both the short-lived WebView handoff tokens (mobile-jwt.ts)
 * and the long-lived native app tokens (native-jwt.ts).
 *
 * Per-tenant scoping: every protected route runs through requireMobileAuth,
 * which now verifies the JWT's restaurantId matches the tenant the request
 * is hitting. A token issued for Restaurant A can't be used against
 * Restaurant B even if the iOS app changes its base URL after sign-in.
 */

import { verifyMobileToken, MobileTokenPayload } from "./mobile-jwt";
import { verifyNativeToken } from "./native-jwt";
import { prisma } from "./db";
import { getCurrentRestaurant } from "./restaurant";

export type MobileAuth = MobileTokenPayload;

/**
 * Decode the JWT and verify it belongs to the current tenant. Returns
 * null when the token is missing, malformed, expired, OR issued for a
 * different tenant — callers that allow guests treat null as "no auth".
 *
 * Backward compat: tokens minted before per-tenant scoping landed don't
 * have `restaurantId` in the payload. We hydrate from the DB once so
 * existing iOS sessions don't blanket-fail after the deploy.
 */
export async function getMobileAuth(
  request: Request
): Promise<MobileAuth | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  let payload: MobileAuth | null = null;
  try {
    payload = await verifyNativeToken(token);
  } catch {
    try {
      payload = await verifyMobileToken(token);
    } catch {
      return null;
    }
  }
  if (!payload) return null;

  // Tenant check: the JWT must match the host the request is hitting.
  // If we can't resolve a tenant (apex / unknown host), let the call
  // proceed without auth — the route's other checks will catch it.
  const tenant = await getCurrentRestaurant();
  if (!tenant) return payload;

  let payloadRestaurantId = payload.restaurantId;
  if (!payloadRestaurantId) {
    const parent = await prisma.parentUser.findUnique({
      where: { id: payload.parentUserId },
      select: { restaurantId: true },
    });
    payloadRestaurantId = parent?.restaurantId;
  }

  if (!payloadRestaurantId || payloadRestaurantId !== tenant.id) {
    return null;
  }
  return payload;
}

export async function requireMobileAuth(request: Request): Promise<MobileAuth> {
  const payload = await getMobileAuth(request);
  if (!payload) {
    throw Object.assign(
      new Error("Unauthorized — sign in for this restaurant to continue."),
      { status: 401 }
    );
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
