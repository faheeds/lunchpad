/**
 * POST /api/mobile/native/auth/apple
 *
 * React Native Sign in with Apple.
 * Same verification as /api/mobile/auth/apple but issues a 90-day JWT
 * (suitable for a native app) instead of the 10-min WebView handoff token.
 *
 * Body: { identityToken: string, fullName?: { givenName?: string, familyName?: string } }
 * Response: { token: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { signNativeToken } from "@/lib/native-jwt";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";
import { getCurrentRestaurant } from "@/lib/restaurant";

export { corsOptions as OPTIONS };

const APPLE_JWKS_URI = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";
const IOS_BUNDLE_ID = "us.lunchpad.app";
const WEB_CLIENT_ID = process.env.AUTH_APPLE_ID ?? "";

const appleJWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URI));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identityToken, fullName } = body as {
      identityToken?: string;
      fullName?: { givenName?: string; familyName?: string };
    };

    if (!identityToken) {
      return NextResponse.json(
        { error: "identityToken is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(identityToken, appleJWKS, {
        issuer: APPLE_ISSUER,
        audience: [IOS_BUNDLE_ID, WEB_CLIENT_ID].filter(Boolean),
      });
      payload = result.payload as Record<string, unknown>;
    } catch (err) {
      console.error("Apple token verification failed:", err);
      return NextResponse.json(
        { error: "Invalid identity token" },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const email = (payload.email as string | undefined)?.toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "No email in Apple token" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Tenant context comes from the request host (e.g. shake-shack.lunchpad.us
    // sets x-restaurant-slug via middleware). The iOS app should hit the
    // restaurant's subdomain — same scoping as the web flow.
    const restaurant = await getCurrentRestaurant();
    if (!restaurant) {
      return NextResponse.json(
        { error: "Sign-in must hit a restaurant subdomain (e.g. <slug>.lunchpad.us)." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const name =
      [fullName?.givenName, fullName?.familyName].filter(Boolean).join(" ") ||
      undefined;

    const parent = await prisma.parentUser.upsert({
      where: { restaurantId_email: { restaurantId: restaurant.id, email } },
      update: {
        ...(name ? { name } : {}),
        provider: "apple",
        providerId: payload.sub as string,
      },
      create: {
        restaurantId: restaurant.id,
        email,
        name,
        provider: "apple",
        providerId: payload.sub as string,
      },
    });

    const token = await signNativeToken({
      parentUserId: parent.id,
      email: parent.email,
      name: parent.name ?? undefined,
    });

    return NextResponse.json({ token }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Native Apple auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
