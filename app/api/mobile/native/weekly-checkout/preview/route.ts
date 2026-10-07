/**
 * GET /api/mobile/native/weekly-checkout/preview?week=current|next
 *
 * Read-only price preview of the parent's saved weekly plan (same builder
 * and discount engine as POST /api/mobile/native/weekly-checkout, writes
 * nothing). Sales tax is added on Stripe's page and is not included.
 */

import { NextRequest, NextResponse } from "next/server";
import { previewWeeklyCheckoutBatch } from "@/lib/weekly-checkout";
import { parseWeekScope } from "@/lib/weekly-week";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";
import { logException } from "@/lib/log";

export { corsOptions as OPTIONS };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);
    const preview = await previewWeeklyCheckoutBatch(
      auth.parentUserId,
      undefined,
      parseWeekScope(request.nextUrl.searchParams.get("week"))
    );
    return NextResponse.json({ preview }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    logException(err, "mobile_weekly_checkout_preview_failed");
    const status = (err as { status?: number }).status ?? 400;
    const message = err instanceof Error ? err.message : "Unable to load your week's total.";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
