/**
 * GET /api/mobile/native/order/success?orderId=xxx
 *
 * Stripe redirects here after successful payment.
 * We redirect to the deep link lunchpad://checkout/success?orderId=xxx
 * so the React Native app can navigate to the confirmation screen.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
  return NextResponse.redirect(
    `lunchpad://checkout/success?orderId=${orderId}`
  );
}
