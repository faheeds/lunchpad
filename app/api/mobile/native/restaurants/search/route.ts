/**
 * GET /api/mobile/native/restaurants/search
 *
 * Restaurant discovery endpoint for the mobile app's initial "find your
 * restaurant" screen. This is a deliberate exception to tenant-scoping:
 * it's cross-tenant, unauthenticated, and required for app bootstrapping.
 *
 * Query param `q` is the user's input — could be a name ("Local Bigger Burger"),
 * a slug ("lbb"), or a pasted link ("lbb.lunchpad.us" or "https://lbb.lunchpad.us").
 *
 * Input normalization: strip https://, strip .lunchpad.us and trailing slash/path,
 * lowercase, trim. All three input styles resolve the same way.
 *
 * Returns only active restaurants, matching by partial name (case-insensitive)
 * or slug. Response includes only public branding: slug, name, logoUrl,
 * primaryColor. No auth required. No tenant scoping.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

function normalizeQuery(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "") // strip https:// or http://
    .replace(/\.lunchpad\.us\/?.*$/, "") // strip .lunchpad.us and everything after
    .toLowerCase()
    .trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");

    if (!q || q.trim() === "") {
      return NextResponse.json(
        { error: "q parameter is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const normalized = normalizeQuery(q);

    // Search across active restaurants by name (partial, case-insensitive)
    // or slug (partial match). Order by relevance: exact slug match first,
    // then name matches, then alphabetically.
    const restaurants = await prisma.restaurant.findMany({
      where: {
        isActive: true,
        OR: [
          {
            name: {
              contains: normalized,
              mode: "insensitive",
            },
          },
          {
            slug: {
              contains: normalized,
            },
          },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
      },
      take: 20,
    });

    // Sort by relevance: exact slug match first, then by name match quality,
    // then alphabetically.
    const sorted = restaurants.sort((a, b) => {
      const aExactSlugMatch = a.slug === normalized ? 1 : 0;
      const bExactSlugMatch = b.slug === normalized ? 1 : 0;

      if (aExactSlugMatch !== bExactSlugMatch) {
        return bExactSlugMatch - aExactSlugMatch;
      }

      const aNameMatch = a.name.toLowerCase().includes(normalized) ? 1 : 0;
      const bNameMatch = b.name.toLowerCase().includes(normalized) ? 1 : 0;

      if (aNameMatch !== bNameMatch) {
        return bNameMatch - aNameMatch;
      }

      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(sorted, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[mobile/restaurants/search] error:", err);
    return NextResponse.json(
      { error: "Failed to search restaurants" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
