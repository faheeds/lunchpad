/**
 * Resolve the canonical base URL for the current request, honoring the
 * tenant subdomain or custom domain the customer is actually on.
 *
 * Used by Stripe Checkout success/cancel URLs and any other place that
 * generates redirects: without this, all tenants bounce back to the apex
 * after checkout, which breaks session cookies and is jarring UX.
 *
 * Falls back to env.APP_BASE_URL only when no host header is present
 * (e.g. server-to-server invocations).
 */

import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Resolve the canonical base URL for the current request.
 *
 * Resolution order:
 *   1. `x-custom-domain` header → operator's BYOD (set by middleware)
 *   2. `x-restaurant-slug` header → tenant subdomain (set by middleware)
 *   3. `x-forwarded-host` / `host` → raw request host (fallback)
 *   4. `env.APP_BASE_URL` → server-to-server, no host context
 *
 * Uses next/headers rather than the `Request` object directly because
 * middleware-mutated headers are reliably visible through that API
 * across Vercel's edge → function hop.
 *
 * The optional `request` arg keeps the older signature working but is
 * no longer required — pass nothing and we'll read from the runtime.
 */
export async function getRequestBaseUrl(_request?: Request): Promise<string> {
  const h = await headers();

  // 1. Operator's custom domain (e.g. lunch.example.com)
  const customDomain = h.get("x-custom-domain");
  if (customDomain) return `https://${customDomain}`;

  // 2. Tenant subdomain — middleware already resolved this from host
  const slug = h.get("x-restaurant-slug");
  if (slug) {
    const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";
    return `https://${slug}.${rootDomain}`;
  }

  // 3. Raw host headers — fallback for paths the middleware didn't tag
  const forwarded = h.get("x-forwarded-host");
  const host = forwarded || h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  // 4. Server-to-server invocations with no host info
  return env.APP_BASE_URL;
}
