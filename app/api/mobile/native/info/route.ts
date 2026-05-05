/**
 * GET /api/mobile/native/info
 *
 * Validates that the subdomain resolves to an active restaurant.
 * Called by the React Native app to validate a school code before saving it.
 *
 * Response: { id: string, name: string, slug: string }
 */

import { NextResponse } from "next/server";
import { requireRestaurant } from "@/lib/restaurant";
import { CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function GET() {
  try {
    const restaurant = await requireRestaurant();
    return NextResponse.json(
      { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404, headers: CORS_HEADERS }
    );
  }
}
