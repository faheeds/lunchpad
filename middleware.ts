import { NextRequest, NextResponse } from "next/server";

// Paths that bypass restaurant resolution (public platform routes)
const PUBLIC_PATHS = [
  "/api/auth",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const host = req.headers.get("host") ?? "";

  // Resolve the restaurant slug from the subdomain.
  // In production:  medina.lunchpad.us  → slug = "medina"
  // In development: use RESTAURANT_SLUG env var or default to "demo"
  let restaurantSlug: string | null = null;

  const rootDomain = process.env.ROOT_DOMAIN ?? "lunchpad.us";
  const isProduction = host.endsWith(`.${rootDomain}`);

  // Always forward the current pathname so server components can read it
  // (used by admin layout to skip setup-redirect on the setup page itself).
  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname);

  // TEMP DEBUG: surface the runtime values so we can diagnose multi-tenant routing.
  // Remove after debugging.
  res.headers.set("x-debug-host", host);
  res.headers.set("x-debug-root-domain", rootDomain);
  res.headers.set("x-debug-is-production", String(isProduction));

  if (isProduction) {
    restaurantSlug = host.replace(`.${rootDomain}`, "");
  } else if (host.includes(".vercel.app") || host.includes("localhost")) {
    // Vercel preview / local dev: read from env if explicitly set.
    // No fallback — omitting RESTAURANT_SLUG shows the platform landing page.
    restaurantSlug = process.env.RESTAURANT_SLUG ?? null;
  } else {
    // Unknown host — could be a restaurant's custom domain (e.g. lunch.example.com).
    // Forward as x-custom-domain; restaurant.ts will do the DB lookup.
    res.headers.set("x-custom-domain", host);
    return res;
  }

  if (!restaurantSlug) {
    // No restaurant context — show the platform landing page
    return res;
  }

  // Forward the slug via header so server components can read it
  // without hitting the DB in middleware (avoid cold-start latency).
  // The actual DB lookup happens in lib/restaurant.ts on first use.
  res.headers.set("x-restaurant-slug", restaurantSlug);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
