import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { logInfo, logWarn, logException } from "@/lib/log";
import { markOrderPaidByCheckoutSession } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { sendPushForOrder } from "@/lib/push/service";

/**
 * How long a parent-facing Stripe Checkout session stays open. Stripe's
 * minimum is 30 minutes. Short enough that an abandoned checkout clears
 * itself (Stripe fires checkout.session.expired), long enough to finish
 * paying. Admin "send payment link" sessions keep Stripe's 24h default.
 */
export const PARENT_CHECKOUT_TTL_SECONDS = 31 * 60;

/** A PENDING order younger than this may still be mid-creation (the Stripe
 *  session is created just after the order row). Don't touch it. */
const FRESH_ORDER_MS = 20 * 1000;

export function normalizeStudentName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Cancel a PENDING order that was never paid: order -> CANCELLED, payment ->
 * FAILED, and release any discount redemption so the discount's cap (and the
 * parent's multi-day streak) isn't consumed by a checkout that never happened.
 * Idempotent: returns false if the order is no longer PENDING.
 */
export async function cancelAbandonedOrder(orderId: string, reason: string): Promise<boolean> {
  const cancelled = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (res.count === 0) return false;

    await tx.payment.updateMany({
      where: { orderId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    });

    const redemptions = await tx.discountRedemption.findMany({
      where: { orderId },
      select: { id: true, discountId: true },
    });
    for (const r of redemptions) {
      await tx.discountRedemption.delete({ where: { id: r.id } });
      await tx.discount.updateMany({
        where: { id: r.discountId, currentRedemptions: { gt: 0 } },
        data: { currentRedemptions: { decrement: 1 } },
      });
    }
    return true;
  });
  if (cancelled) logInfo("pending_order_cancelled", { orderId, reason });
  return cancelled;
}

export type SettleResult = "paid" | "cancelled" | "still_open" | "unknown";

async function healPaid(sessionId: string, paymentIntent: unknown, amountTotal: number | null) {
  const piId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : paymentIntent && typeof paymentIntent === "object" && "id" in paymentIntent
        ? String((paymentIntent as { id: unknown }).id)
        : null;
  const order = await markOrderPaidByCheckoutSession(sessionId, piId, amountTotal);
  logWarn("pending_order_healed_paid", { orderId: order.id, sessionId });
  try {
    await sendOrderConfirmationEmail(order.id, order.restaurantId);
  } catch {
    // Logged by the email service; can be resent from admin.
  }
  sendPushForOrder(order.id, {
    title: "Order confirmed!",
    body: "Your lunch order is on its way.",
    data: { screen: "order", orderId: order.id },
  }).catch(() => {});
}

/**
 * Resolve one PENDING order against Stripe, the source of truth:
 *  - session paid      -> mark the order PAID (heals a missed webhook)
 *  - session expired   -> cancel the order
 *  - session still open-> leave it (or, with expireOpen, expire it then cancel)
 *  - Stripe unreachable-> "unknown"; callers must not assume unpaid.
 */
export async function settlePendingOrder(
  order: { id: string; checkoutSessionId: string | null },
  opts: { expireOpen?: boolean } = {}
): Promise<SettleResult> {
  if (!order.checkoutSessionId) {
    return (await cancelAbandonedOrder(order.id, "no_checkout_session")) ? "cancelled" : "unknown";
  }
  if (!stripe) return "unknown";

  try {
    let session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);

    if (session.payment_status === "paid") {
      await healPaid(session.id, session.payment_intent, session.amount_total ?? null);
      return "paid";
    }

    if (session.status === "open") {
      if (!opts.expireOpen) return "still_open";
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // The customer may have just paid; re-read before deciding.
      }
      session = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
      if (session.payment_status === "paid") {
        await healPaid(session.id, session.payment_intent, session.amount_total ?? null);
        return "paid";
      }
      if (session.status === "open") return "unknown";
    }

    if (session.status === "expired") {
      return (await cancelAbandonedOrder(order.id, "checkout_session_expired")) ? "cancelled" : "unknown";
    }
    // status "complete" but not paid: an async payment method is still settling.
    return "unknown";
  } catch (err) {
    logException(err, "pending_order_settle_failed", { orderId: order.id });
    return "unknown";
  }
}

export type DuplicateResolution =
  | { ok: true }
  | { ok: false; reason: "already_paid" | "in_progress"; message: string };

/**
 * Called before creating a new order. If this parent already has a PENDING
 * order for the same student and delivery date, settle it against Stripe
 * instead of blocking them: a stale/abandoned checkout is cancelled so the
 * parent can simply start over; a checkout that was actually paid is
 * reported so they don't pay twice. Siblings are unaffected (matched by
 * student name).
 */
export async function resolveDuplicatePendingOrder(args: {
  parentUserId: string;
  deliveryDateId: string;
  studentName: string;
}): Promise<DuplicateResolution> {
  const wanted = normalizeStudentName(args.studentName);
  const pending = await prisma.order.findMany({
    where: {
      parentUserId: args.parentUserId,
      deliveryDateId: args.deliveryDateId,
      status: OrderStatus.PENDING,
    },
    select: { id: true, checkoutSessionId: true, createdAt: true, student: { select: { studentName: true } } },
  });

  for (const p of pending) {
    if (normalizeStudentName(p.student?.studentName) !== wanted) continue;

    if (Date.now() - p.createdAt.getTime() < FRESH_ORDER_MS) {
      return {
        ok: false,
        reason: "in_progress",
        message: "Your checkout is still starting. Give it a few seconds and try again.",
      };
    }

    const result = await settlePendingOrder(p, { expireOpen: true });
    if (result === "paid") {
      return {
        ok: false,
        reason: "already_paid",
        message: "Good news: your earlier checkout for this date was paid. Check Order history; no need to order again.",
      };
    }
    if (result === "unknown" || result === "still_open") {
      return {
        ok: false,
        reason: "in_progress",
        message: "We're confirming your earlier checkout for this date. Please try again in a minute.",
      };
    }
  }
  return { ok: true };
}
