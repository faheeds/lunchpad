/**
 * Apex OAuth relay — the second leg of the platform-domain sign-in flow.
 *
 * Why this exists: parent sign-in starts on a tenant subdomain
 * (e.g. fsskitchen.lunchpad.us), but if we kicked off OAuth there,
 * Google's redirect_uri would be
 * `https://fsskitchen.lunchpad.us/api/auth/callback/google` — which
 * means every new tenant subdomain needs an entry in the Google
 * Console's redirect URI allow list. That doesn't scale.
 *
 * Instead, `startParentOAuth` (the server action on the tenant) redirects
 * here. This handler runs on the apex (`lunchpad.us`), re-stamps the
 * `lp-tenant-id` cookie with platform-wide scope, and then calls signIn
 * — so redirect_uri becomes `https://lunchpad.us/api/auth/callback/<provider>`
 * regardless of which tenant the user started on. One Google Console
 * entry covers every tenant, present and future.
 *
 * After OAuth completes, NextAuth's `redirect` callback (in lib/auth.ts)
 * routes the user back to `returnTo` (on the originating tenant
 * subdomain). The platform-scoped session cookie carries the auth state
 * across subdomains automatically.
 *
 * This endpoint MUST be unreachable on non-platform domains — if a user
 * arrives here on a custom-domain tenant we redirect them home rather
 * than trying to start OAuth, because the apex cookie won't be readable
 * from their host.
 */

import type { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";

const TENANT_COOKIE_NAME = "lp-tenant-id";
const TENANT_COOKIE_MAX_AGE = 60 * 10; // 10 minutes — same as the tenant-side action

export const dynamic = "force-dynamic";

function isAllowedProvider(value: string | null): value is "google" | "apple" {
  return value === "google" || value === "apple";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const provider = url.searchParams.get("provider");
  const returnTo = url.searchParams.get("returnTo");
  const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";

  // Hard guards: anything weird sends the user back to the marketing site.
  // The redirect() below throws to short-circuit; no need to return a
  // Response after it.
  if (!tenantId || !isAllowedProvider(provider)) {
    redirect("/");
  }

  // Confirm this relay is being called on the apex. If not — e.g. an
  // attacker tries to use the relay path on a tenant subdomain — bail
  // out, because the platform-wide cookies we need to set won't be
  // readable cross-domain from a non-apex origin.
  const hdrs = await headers();
  const currentHost = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  if (currentHost !== rootDomain) {
    redirect("/");
  }

  // Verify the tenant exists. Prevents this endpoint from being abused as
  // an open redirect to arbitrary returnTo values claimed under a fake
  // tenant ID.
  const tenant = await prisma.restaurant.findUnique({
    where: { id: tenantId, isActive: true },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    redirect("/");
  }

  // Validate returnTo — only allow URLs on the platform root domain or
  // its subdomains. Anything else falls back to the tenant's own
  // /account page so the user lands somewhere sensible.
  let safeReturnTo = `https://${tenant.slug}.${rootDomain}/account`;
  if (returnTo) {
    try {
      const parsed = new URL(returnTo);
      if (parsed.hostname === rootDomain || parsed.hostname.endsWith(`.${rootDomain}`)) {
        safeReturnTo = parsed.toString();
      }
    } catch {
      // Malformed — fall through to the default safeReturnTo.
    }
  }

  // Re-stamp the tenant cookie with the platform-wide domain. The tenant
  // action already set it on the originating subdomain, but only with
  // domain=.lunchpad.us; the browser sends it to the apex automatically.
  // We re-set here defensively in case the original cookie failed to
  // promote (e.g. host-only fallback when ROOT_DOMAIN wasn't readable).
  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE_NAME, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge: TENANT_COOKIE_MAX_AGE,
    domain: `.${rootDomain}`,
  });

  // Kick off OAuth on the apex. NextAuth derives redirect_uri from the
  // request host, which is now `lunchpad.us` — so Google only ever needs
  // `https://lunchpad.us/api/auth/callback/<provider>` configured.
  // signIn internally calls redirect() which throws, so this never
  // returns normally; the implicit Response is built by Next.
  await signIn(provider, { redirectTo: safeReturnTo });
}
