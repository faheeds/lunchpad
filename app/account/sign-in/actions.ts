"use server";

/**
 * Server actions for the parent sign-in flow.
 *
 * Why this exists: NextAuth's `signIn("google")` doesn't tell the JWT
 * callback which tenant subdomain the user started on. Without that
 * context, the auth callback can't scope the ParentUser lookup to the
 * right restaurant — same Gmail across two restaurants would resolve to
 * whichever record was created first, leaking data across tenants.
 *
 * The fix: before kicking off OAuth, drop a short-lived cookie at
 * `.lunchpad.us` scope with the current restaurant's ID. The cookie
 * survives the round trip through Google/Apple and is read in
 * `lib/auth.ts`'s jwt callback to scope the `ParentUser` upsert.
 */

import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import { getCurrentRestaurant } from "@/lib/restaurant";

const TENANT_COOKIE_NAME = "lp-tenant-id";
const TENANT_COOKIE_MAX_AGE = 60 * 10; // 10 minutes — generous for OAuth round-trip

export async function startParentOAuth(provider: "google" | "apple") {
  const restaurant = await getCurrentRestaurant();
  if (!restaurant) {
    throw new Error("Sign-in must start on a restaurant subdomain.");
  }

  // Drop the tenant cookie BEFORE redirecting to the provider so the
  // JWT callback (which runs after the OAuth round-trip) can read it.
  // Domain-scope to .lunchpad.us so the cookie survives the bounce
  // through the apex (NEXTAUTH_URL) — same approach the rest of the
  // NextAuth cookies use.
  const cookieDomain = process.env.NEXTAUTH_URL?.includes(".lunchpad.us") || process.env.NEXTAUTH_URL?.endsWith("lunchpad.us")
    ? ".lunchpad.us"
    : undefined;

  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE_NAME, restaurant.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: TENANT_COOKIE_MAX_AGE,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  // Hand off to NextAuth. callbackUrl brings the user back to the same
  // tenant subdomain after the OAuth round-trip completes.
  await signIn(provider, { redirectTo: "/account" });
}
