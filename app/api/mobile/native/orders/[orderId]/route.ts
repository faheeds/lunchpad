/**
 * DELETE /api/mobile/native/orders/[orderId]
 *
 * Cancel a PAID order before its delivery cutoff. Issues a full Stripe
 * refund via cancelOrderWithRefund (same path as the web cancel flow).
 * Auth: Bearer JWT required.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireMobileAuth,
  options as corsOptions,
  jsonOk,
  jsonErr,
} from "@/lib/mobile-bearer";
import { cancelOrderWithRefund } from "@/lib/orders";
import { sendCancellationEmail } from "@/lib/email/service";

export { corsOptions as OPTIONS };

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const auth = await requireMobileAuth(request);
    const { orderId } = await context.params;

    // Pre-check: verify tenant ownership before touching Stripe.
    // This avoids leaking information about other tenants' orders.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, parentUserId: true, restaurantId: true },
    });

    if (!order || order.restaurantId !== auth.restaurantId) {
      return jsonErr("Order not found.", 404);
    }
    if (order.parentUserId !== auth.parentUserId) {
      return jsonErr("Not your order.", 403);
    }

    try {
      await cancelOrderWithRefund({ orderId, parentUserId: auth.parentUserId });
    } catch (cancelErr: unknown) {
      const msg = cancelErr instanceof Error ? cancelErr.message : "";

      if (msg === "Order not found.") {
        return jsonErr("Order not found.", 404);
      }
      if (msg === "Not authorized to cancel this order.") {
        return jsonErr("Not authorized to cancel this order.", 403);
      }
      if (msg === "Only paid orders can be cancelled.") {
        return jsonErr("Only paid orders can be cancelled.", 409);
      }

      // Any other error (assertOrderingOpen cutoff, etc.) → 422
      if (cancelErr instanceof Error) {
        return jsonErr(cancelErr.message, 422);
      }

      return jsonErr("Failed to cancel order.", 500);
    }

    // Best-effort cancellation email — never let this fail the response.
    sendCancellationEmail(orderId, auth.restaurantId).catch(() => {});

    return jsonOk({ ok: true });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to cancel order.";
    return jsonErr(message, status);
  }
}
