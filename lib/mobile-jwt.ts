/**
 * Short-lived JWT tokens for mobile auth token exchange.
 *
 * Flow:
 *   1. iOS app does native Apple / Google sign-in → gets identity token
 *   2. POSTs identity token to /api/mobile/auth/[provider]
 *   3. Endpoint verifies token, upserts ParentUser, calls signMobileToken()
 *   4. Returns the JWT to the app
 *   5. App navigates WebView to /mobile-login?token=JWT
 *   6. /mobile-login calls verifyMobileToken() and creates a NextAuth session
 */

import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const secret = new TextEncoder().encode(env.NEXTAUTH_SECRET);
const ISSUER = "lbb-mobile";
const AUDIENCE = "lbb-web";
const EXPIRY = "10m"; // short-lived — just for the handoff to the WebView session

export type MobileTokenPayload = {
  parentUserId: string;
  email: string;
  name?: string;
};

export async function signMobileToken(payload: MobileTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret);
}

export async function verifyMobileToken(token: string): Promise<MobileTokenPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return {
    parentUserId: payload.parentUserId as string,
    email: payload.email as string,
    name: payload.name as string | undefined,
  };
}
