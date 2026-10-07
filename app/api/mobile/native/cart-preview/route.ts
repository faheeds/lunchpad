/**
 * POST /api/mobile/native/cart-preview
 *
 * Read-only price preview for a live cart: same body as
 * /api/mobile/native/cart-checkout, same builder and discount engine, but
 * nothing is written and no Stripe session is created. Lets the app show
 * multi-day savings before the parent pays. Sales tax is added on Stripe's
 * page and is not included.
 */

import { NextRequest, NextResponse } from "next/server";
import { previewAdHocCheckout } from "@/lib/weekly-checkout";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";
import { logException } from "@/lib/log";

export { corsOptions as OPTIONS };

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400, headers: CORS_HEADERS });
    }

    const cartItems = items.map((item: Record<string, unknown>) => ({
      parentChildId: String(item.parentChildId ?? ""),
      deliveryDateId: String(item.deliveryDateId ?? ""),
      menuItemId: String(item.menuItemId ?? ""),
      choice: item.choice ? String(item.choice) : null,
      size: item.size ? String(item.size) : null,
      additions: Array.isArray(item.additions) ? item.additions.map(String) : [],
      removals: Array.isArray(item.removals) ? item.removals.map(String) : [],
    }));
    const code = typeof body?.code === "string" ? body.code : undefined;

    const preview = await previewAdHocCheckout(auth.parentUserId, cartItems, code);
    return NextResponse.json({ preview }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    logException(err, "mobile_cart_preview_failed");
    const status = (err as { status?: number }).status ?? 400;
    const message = err instanceof Error ? err.message : "Unable to load your total.";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
