/**
 * GET /api/mobile/native/info
 *
 * Validates that the subdomain resolves to an active restaurant AND returns
 * the brand surface the iOS app needs to theme itself: name, logo, color
 * palette, hero image, fonts, support contacts. The iOS app caches this
 * payload and uses it across every screen.
 *
 * Called twice in the iOS lifecycle:
 *   1. School-code validation (first time a parent enters a slug)
 *   2. App cold-start (re-fetch to pick up brand changes without redeploying)
 */

import { NextResponse } from "next/server";
import { requireRestaurant } from "@/lib/restaurant";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function GET() {
  try {
    const restaurant = await requireRestaurant();
    return NextResponse.json(
      {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,

        // Branding — used by the iOS ThemeProvider. All fields nullable;
        // the app falls back to LunchPad neutral defaults when unset.
        logoUrl: restaurant.logoUrl,
        heroImageUrl: restaurant.heroImageUrl,
        primaryColor: restaurant.primaryColor,
        accentColor: restaurant.accentColor,
        darkColor: restaurant.darkColor,
        heroTitleColor: restaurant.heroTitleColor,
        heroAccentColor: restaurant.heroAccentColor,
        bodyTextColor: restaurant.bodyTextColor,
        displayFont: restaurant.displayFont,
        bodyFont: restaurant.bodyFont,

        // Contact (for "Need help?" footers in the app).
        contactEmail: restaurant.contactEmail,
        contactPhone: restaurant.contactPhone,
      },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404, headers: CORS_HEADERS }
    );
  }
}
