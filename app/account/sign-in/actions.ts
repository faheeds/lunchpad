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
 * The fix: before kicking off OAuth, drop a short-lived cookie scoped to
 * the platform root domain (from `ROOT_DOMAIN`, defaulting to
 * `lunchpad.us`) with the current restaurant's ID. The cookie survives
 * the round trip through Google/Apple and is read in `lib/auth.ts`'s
 * jwt callback to scope the `ParentUser` upsert. Operators on custom
 * domains (e.g. lunch.example.com) handle this differently — they run
 * the entire OAuth flow on their own host so no cross-domain cookie
 * scoping is needed; we fall through to host-only there.
 */

import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";
import { getCurrentRestaurant } from "@/lib/restaurant";

const TENANT_COOKIE_NAME = "lp-tenant-id";
const TENANT_COOKIE_MAX_AGE = 60 * 10; // 10 minutes — generous for OAuth round-trip

/**
 * Resolve the cookie domain for the tenant cookie. Returns `.<rootDomain>`
 * when the current `NEXTAUTH_URL` is a subdomain of the platform root
 * (so the cookie survives bouncing through the apex during OAuth) and
 * `undefined` otherwise (custom domains and previews stay host-only).
 */
function resolveTenantCookieDomain(): string | undefined {
  const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";
  const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";
  try {
    const host = new URL(nextAuthUrl).hostname;
    if (host.endsWith(`.${rootDomain}`) || host === rootDomain) {
      return `.${rootDomain}`;
    }
  } catch {
    // NEXTAUTH_URL malformed — fall through to host-only
  }
  return undefined;
}

export async function startParentOAuth(provider: "google" | "apple") {
  const restaurant = await getCurrentRestaurant();
  if (!restaurant) {
    throw new Error("Sign-in must start on a restaurant subdomain.");
  }

  const cookieDomain = resolveTenantCookieDomain();

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
