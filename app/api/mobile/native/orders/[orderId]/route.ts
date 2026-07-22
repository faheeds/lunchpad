/**
 * PATCH /api/mobile/native/orders/[orderId] — modify a PAID order before cutoff
 * DELETE /api/mobile/native/orders/[orderId] — cancel a PAID order before cutoff
 *
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
import { cancelOrderWithRefund, updateOrderBeforeCutoff } from "@/lib/orders";
import { sendCancellationEmail } from "@/lib/email/service";
import { sendPushForOrder } from "@/lib/push/service";

export { corsOptions as OPTIONS };

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const auth = await requireMobileAuth(request);
    const { orderId } = await context.params;

    // Pre-check: verify tenant ownership before calling updateOrderBeforeCutoff.
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

    const body = await request.json();

    let result: Awaited<ReturnType<typeof updateOrderBeforeCutoff>>;
    try {
      result = await updateOrderBeforeCutoff({
        orderId,
        parentUserId: auth.parentUserId,
        additions: Array.isArray(body.additions) ? body.additions : [],
        removals: Array.isArray(body.removals) ? body.removals : [],
        allergyNotes: typeof body.allergyNotes === "string" ? body.allergyNotes : undefined,
        dietaryNotes: typeof body.dietaryNotes === "string" ? body.dietaryNotes : undefined,
        specialInstructions: typeof body.specialInstructions === "string" ? body.specialInstructions : undefined,
        teacherName: typeof body.teacherName === "string" ? body.teacherName : undefined,
        classroom: typeof body.classroom === "string" ? body.classroom : undefined,
      });
    } catch (modifyErr: unknown) {
      const msg = modifyErr instanceof Error ? modifyErr.message : "";

      if (msg === "Order not found.") return jsonErr("Order not found.", 404);
      if (msg === "Only paid orders can be modified.") return jsonErr(msg, 409);
      if (msg.startsWith("You already have a pending edit")) return jsonErr(msg, 409);
      if (msg.startsWith("This order has already been increased once")) return jsonErr(msg, 409);

      // Cutoff errors, invalid add-on/removal, too-close-to-cutoff → 422
      if (modifyErr instanceof Error) return jsonErr(modifyErr.message, 422);
      return jsonErr("Failed to modify order.", 500);
    }

    if (result.action === "checkout_required") {
      return jsonOk({ action: "checkout_required", checkoutUrl: result.checkoutUrl });
    }

    return jsonOk({ action: "updated", order: result.order });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to modify order.";
    return jsonErr(message, status);
  }
}

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
    sendPushForOrder(orderId, { title: "Order cancelled", body: "Your order has been cancelled and a refund is on the way." }).catch(() => {});

    return jsonOk({ ok: true });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to cancel order.";
    return jsonErr(message, status);
  }
}
