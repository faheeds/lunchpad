/**
 * Long-lived JWT tokens for the native React Native app.
 * Unlike the 10-min WebView handoff token in mobile-jwt.ts, these last 90 days.
 */

import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const secret = new TextEncoder().encode(env.NEXTAUTH_SECRET);
const ISSUER = "lunchpad-native";
const AUDIENCE = "lunchpad-native";
const EXPIRY = "90d";

export type NativeTokenPayload = {
  parentUserId: string;
  email: string;
  name?: string;
};

export async function signNativeToken(
  payload: NativeTokenPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret);
}

export async function verifyNativeToken(
  token: string
): Promise<NativeTokenPayload> {
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
