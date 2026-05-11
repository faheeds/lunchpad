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

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
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

  // ── Apex bouncer ─────────────────────────────────────────────────
  // When we're on a platform subdomain (e.g. fsskitchen.lunchpad.us), we
  // redirect to a route handler on the apex (lunchpad.us) that kicks off
  // OAuth there. That way Google's redirect_uri is always
  // https://lunchpad.us/api/auth/callback/<provider> — one entry in the
  // Google Console covers every tenant, present and future. The
  // platform-wide cookies (sessionToken / csrfToken / pkce / state /
  // lp-tenant-id) are all already scoped to .lunchpad.us by lib/auth.ts
  // so they ride along through the apex round-trip unchanged.
  //
  // Custom domains (e.g. lunch.example.com) don't share the apex cookie
  // space — they fall through to local OAuth on their own host and
  // operators have to register their own callback URL in their own
  // Google project. That's the price of bring-your-own-domain.
  const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";
  const hdrs = await headers();
  // X-Forwarded-Host is set by Vercel; fall back to Host header. Both are
  // strings like "fsskitchen.lunchpad.us".
  const currentHost = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";

  const onPlatformSubdomain =
    currentHost.endsWith(`.${rootDomain}`) && currentHost !== rootDomain;

  if (onPlatformSubdomain) {
    const returnTo = `https://${currentHost}/account`;
    const params = new URLSearchParams({
      provider,
      tenantId: restaurant.id,
      returnTo,
    });
    redirect(`https://${rootDomain}/account/sign-in/oauth-relay?${params.toString()}`);
  }

  // Apex (lunchpad.us itself) or custom domain — run OAuth locally.
  // Apex has no parent flow normally, but we keep this branch for
  // dev/preview hosts where NEXTAUTH_URL maps to the apex.
  await signIn(provider, { redirectTo: "/account" });
}
