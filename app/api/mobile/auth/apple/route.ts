/**
 * POST /api/mobile/auth/apple
 *
 * Accepts an Apple Sign In identity token from the iOS Capacitor app,
 * verifies it against Apple's public keys, upserts the ParentUser, and
 * returns a short-lived mobile JWT the app can exchange for a full session.
 *
 * Body: { identityToken: string, fullName?: { givenName?: string, familyName?: string } }
 * Response: { token: string }  (mobile JWT, 10-minute expiry)
 */

import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { signMobileToken } from "@/lib/mobile-jwt";

// CORS headers for Capacitor iOS WebView (origin: capacitor://localhost)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const APPLE_JWKS_URI = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";
// The web Services ID (used for web-based Apple Sign In)
const WEB_CLIENT_ID = process.env.AUTH_APPLE_ID ?? "";
// The iOS bundle ID is also a valid audience for SIWA tokens from native apps
const IOS_BUNDLE_ID = "com.localbiggerburger.hotlunch";

const appleJWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URI));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identityToken, fullName } = body as {
      identityToken?: string;
      fullName?: { givenName?: string; familyName?: string };
    };

    if (!identityToken) {
      return NextResponse.json({ error: "identityToken is required" }, { status: 400, headers: CORS_HEADERS });
    }

    // Verify the token against Apple's JWKS.
    // The audience can be either the web Services ID or the iOS bundle ID.
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(identityToken, appleJWKS, {
        issuer: APPLE_ISSUER,
        audience: [WEB_CLIENT_ID, IOS_BUNDLE_ID].filter(Boolean),
      });
      payload = result.payload as Record<string, unknown>;
    } catch (err) {
      console.error("Apple token verification failed:", err);
      return NextResponse.json({ error: "Invalid identity token" }, { status: 401, headers: CORS_HEADERS });
    }

    const email = (payload.email as string | undefined)?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email in Apple token" }, { status: 400, headers: CORS_HEADERS });
    }

    // Build display name from fullName (only provided on first sign-in by Apple)
    const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(" ") || undefined;

    // Upsert the parent user
    const parent = await prisma.parentUser.upsert({
      where: { email },
      update: {
        ...(name ? { name } : {}),
        provider: "apple",
        providerId: payload.sub as string,
      },
      create: {
        email,
        name,
        provider: "apple",
        providerId: payload.sub as string,
      },
    });

    const token = await signMobileToken({
      parentUserId: parent.id,
      email: parent.email,
      name: parent.name ?? undefined,
    });

    return NextResponse.json({ token }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Mobile Apple auth error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
