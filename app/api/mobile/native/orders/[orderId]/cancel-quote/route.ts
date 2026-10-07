/**
 * GET /api/mobile/native/orders/[orderId]/cancel-quote
 *
 * Read-only preview of what a cancellation will refund. When cancelling an
 * earlier day makes a later day lose its multi-day discount, that discount
 * (tax-grossed) is withheld from the refund; this tells the app the exact
 * amounts before the parent confirms. Auth: Bearer JWT.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileAuth, options as corsOptions, jsonOk, jsonErr } from "@/lib/mobile-bearer";
import { getCancellationQuote } from "@/lib/orders";

export { corsOptions as OPTIONS };

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const auth = await requireMobileAuth(request);
    const { orderId } = await context.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, parentUserId: true, restaurantId: true },
    });
    if (!order || order.restaurantId !== auth.restaurantId) return jsonErr("Order not found.", 404);
    if (order.parentUserId !== auth.parentUserId) return jsonErr("Not your order.", 403);

    const quote = await getCancellationQuote({ orderId, parentUserId: auth.parentUserId });
    return jsonOk(quote);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to load refund details.";
    return jsonErr(message, status);
  }
}
