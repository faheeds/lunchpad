/**
 * POST /api/mobile/auth/google
 *
 * Accepts a Google ID token from the iOS Capacitor app (obtained via the
 * native Google Sign-In SDK), verifies it against Google's JWKS, upserts
 * the ParentUser, and returns a short-lived mobile JWT.
 *
 * Body: { idToken: string }
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

const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";

const googleJWKS = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body as { idToken?: string };

    if (!idToken) {
      return NextResponse.json({ error: "idToken is required" }, { status: 400, headers: CORS_HEADERS });
    }

    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: "Google auth not configured" }, { status: 503, headers: CORS_HEADERS });
    }

    // Verify against Google's JWKS
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(idToken, googleJWKS, {
        audience: GOOGLE_CLIENT_ID,
      });
      payload = result.payload as Record<string, unknown>;
      // Google uses "iss" as a string matching either issuer form
      if (!GOOGLE_ISSUERS.includes(payload.iss as string)) {
        throw new Error("Invalid issuer");
      }
    } catch (err) {
      console.error("Google token verification failed:", err);
      return NextResponse.json({ error: "Invalid ID token" }, { status: 401, headers: CORS_HEADERS });
    }

    const email = (payload.email as string | undefined)?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "No email in Google token" }, { status: 400, headers: CORS_HEADERS });
    }

    const name = (payload.name as string | undefined) || undefined;
    const image = (payload.picture as string | undefined) || undefined;

    // Upsert the parent user
    const parent = await prisma.parentUser.upsert({
      where: { email },
      update: {
        ...(name ? { name } : {}),
        ...(image ? { image } : {}),
        provider: "google",
        providerId: payload.sub as string,
      },
      create: {
        email,
        name,
        image,
        provider: "google",
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
    console.error("Mobile Google auth error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
