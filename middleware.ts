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
  // Set headers on the request so server components' headers() function can read them.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  if (isProduction) {
    restaurantSlug = host.replace(`.${rootDomain}`, "");
  } else if (host.includes(".vercel.app") || host.includes("localhost")) {
    // Vercel preview / local dev: read from env if explicitly set.
    // No fallback — omitting RESTAURANT_SLUG shows the platform landing page.
    restaurantSlug = process.env.RESTAURANT_SLUG ?? null;
  } else {
    // Unknown host — could be a restaurant's custom domain (e.g. lunch.example.com).
    // Forward as x-custom-domain; restaurant.ts will do the DB lookup.
    requestHeaders.set("x-custom-domain", host);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!restaurantSlug) {
    // No restaurant context — show the platform landing page
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Forward the slug via header so server components can read it
  // without hitting the DB in middleware (avoid cold-start latency).
  // The actual DB lookup happens in lib/restaurant.ts on first use.
  requestHeaders.set("x-restaurant-slug", restaurantSlug);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
