/**
 * GET /api/mobile/native/order/cancel?orderId=xxx
 *
 * Stripe redirects here if the user cancels payment.
 * We deep-link back into the app.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
  return NextResponse.redirect(
    `lunchpad://checkout/cancel?orderId=${orderId}`
  );
}
