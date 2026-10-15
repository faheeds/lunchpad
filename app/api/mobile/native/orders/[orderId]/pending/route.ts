/**
 * Parent actions on an unpaid (PENDING) order.
 *
 * POST   /api/mobile/native/orders/[orderId]/pending  -- resume payment
 *   -> { action: "checkout", checkoutUrl }  the Stripe session is still open
 *   -> { action: "paid" }                   it was actually paid (healed)
 *   -> { action: "expired" }                it lapsed; order cancelled, start over
 * DELETE /api/mobile/native/orders/[orderId]/pending  -- cancel without paying
 *   -> { ok: true, action: "cancelled" | "paid" }
 *
 * Stripe is the source of truth: an open session is expired before the order
 * is cancelled, so a parent can never be charged for an order we cancelled.
 *
 * Auth: Bearer JWT required.
 */

import { NextRequest } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import {
  requireMobileAuth,
  options as corsOptions,
  jsonOk,
  jsonErr,
} from "@/lib/mobile-bearer";
import { cancelAbandonedOrder, settlePendingOrder } from "@/lib/pending-orders";

export { corsOptions as OPTIONS };

async function loadOwnedOrder(orderId: string, auth: { parentUserId: string; restaurantId?: string }) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      parentUserId: true,
      restaurantId: true,
      checkoutSessionId: true,
      deliveryDate: { select: { cutoffAt: true } },
    },
  });
  if (!order || order.restaurantId !== auth.restaurantId) return { error: jsonErr("Order not found.", 404) };
  if (order.parentUserId !== auth.parentUserId) return { error: jsonErr("Not your order.", 403) };
  return { order };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const auth = await requireMobileAuth(request);
    const { orderId } = await context.params;
    const loaded = await loadOwnedOrder(orderId, auth);
    if (loaded.error) return loaded.error;
    const order = loaded.order;

    if (order.status === OrderStatus.PAID) return jsonOk({ action: "paid" });
    if (order.status !== OrderStatus.PENDING) return jsonErr("This order is no longer pending.", 409);

    // Past the cutoff there is nothing left to pay for.
    if (order.deliveryDate.cutoffAt.getTime() <= Date.now()) {
      const result = await settlePendingOrder(order, { expireOpen: true });
      if (result === "paid") return jsonOk({ action: "paid" });
      return jsonOk({ action: "expired" });
    }

    if (stripe && order.checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
      if (session.payment_status !== "paid" && session.status === "open" && session.url) {
        return jsonOk({ action: "checkout", checkoutUrl: session.url });
      }
    }

    const result = await settlePendingOrder(order);
    if (result === "paid") return jsonOk({ action: "paid" });
    if (result === "cancelled") return jsonOk({ action: "expired" });
    return jsonErr("We're still confirming this payment. Please try again in a minute.", 409);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to resume payment.";
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
    const loaded = await loadOwnedOrder(orderId, auth);
    if (loaded.error) return loaded.error;
    const order = loaded.order;

    if (order.status === OrderStatus.CANCELLED) return jsonOk({ ok: true, action: "cancelled" });
    if (order.status === OrderStatus.PAID) return jsonOk({ ok: true, action: "paid" });
    if (order.status !== OrderStatus.PENDING) return jsonErr("This order is no longer pending.", 409);

    const result = await settlePendingOrder(order, { expireOpen: true });
    if (result === "paid") return jsonOk({ ok: true, action: "paid" });
    if (result !== "cancelled") {
      return jsonErr("We're still confirming this payment. Please try again in a minute.", 409);
    }

    // A weekly checkout covers several orders in one Stripe session; expiring
    // it released all of them, so cancel the rest to match.
    if (order.checkoutSessionId) {
      const siblings = await prisma.order.findMany({
        where: {
          checkoutSessionId: order.checkoutSessionId,
          parentUserId: auth.parentUserId,
          status: OrderStatus.PENDING,
          id: { not: order.id },
        },
        select: { id: true },
      });
      for (const s of siblings) await cancelAbandonedOrder(s.id, "parent_cancelled_batch");
    }

    return jsonOk({ ok: true, action: "cancelled" });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to cancel order.";
    return jsonErr(message, status);
  }
}
