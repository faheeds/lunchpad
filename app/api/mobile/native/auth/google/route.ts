/**
 * POST /api/mobile/native/auth/google
 *
 * React Native Google Sign-In, mirroring /api/mobile/native/auth/apple's
 * pattern exactly (native 90-day JWT, same restaurant-scoping, same
 * upsert-by-(restaurantId, email) approach) -- NOT the older
 * /api/mobile/auth/google, which was built for a previous Capacitor-based
 * iOS wrapper and issues the short-lived WebView handoff token instead of
 * a native-app-appropriate one.
 *
 * The native iOS Google Sign-In SDK is configured with both an iOS-type
 * client ID (drives the native sign-in UI, no secret) and this web client
 * ID as its "server client ID" -- Google's own recommended pattern for
 * when a backend server (not just the device) needs to verify the
 * resulting token. Depending on exactly how the SDK is configured, the
 * token's audience could be either one, so both are accepted here.
 *
 * Body: { idToken: string }
 * Response: { token: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { signNativeToken } from "@/lib/native-jwt";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";
import { getCurrentRestaurant } from "@/lib/restaurant";

export { corsOptions as OPTIONS };

const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
// Web client ID (already configured for the web sign-in flow) and the
// iOS-specific client ID (created separately in Google Cloud Console,
// application type "iOS", since Google requires a distinct client per
// platform type -- native apps get no secret, unlike the web client).
const WEB_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID ?? "";

const googleJWKS = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body as { idToken?: string };

    if (!idToken) {
      return NextResponse.json(
        { error: "idToken is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const validAudiences = [WEB_CLIENT_ID, IOS_CLIENT_ID].filter(Boolean);
    if (validAudiences.length === 0) {
      return NextResponse.json(
        { error: "Google auth not configured" },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(idToken, googleJWKS, {
        audience: validAudiences,
      });
      payload = result.payload as Record<string, unknown>;
      if (!GOOGLE_ISSUERS.includes(payload.iss as string)) {
        throw new Error("Invalid issuer");
      }
    } catch (err) {
      console.error("Google token verification failed:", err);
      return NextResponse.json(
        { error: "Invalid identity token" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const email = (payload.email as string | undefined)?.toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "No email in Google token" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Tenant context comes from the request host (e.g.
    // shake-shack.lunchpad.us sets x-restaurant-slug via middleware) --
    // same scoping as the native Apple flow and the web flow.
    const restaurant = await getCurrentRestaurant();
    if (!restaurant) {
      return NextResponse.json(
        { error: "Sign-in must hit a restaurant subdomain (e.g. <slug>.lunchpad.us)." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const name = (payload.name as string | undefined) || undefined;

    const parent = await prisma.parentUser.upsert({
      where: { restaurantId_email: { restaurantId: restaurant.id, email } },
      update: {
        ...(name ? { name } : {}),
        provider: "google",
        providerId: payload.sub as string,
      },
      create: {
        restaurantId: restaurant.id,
        email,
        name,
        provider: "google",
        providerId: payload.sub as string,
      },
    });

    const token = await signNativeToken({
      parentUserId: parent.id,
      email: parent.email,
      name: parent.name ?? undefined,
      restaurantId: parent.restaurantId,
    });

    return NextResponse.json({ token }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Native Google auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
