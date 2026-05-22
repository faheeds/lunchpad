import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { logActivity } from "@/lib/activity";
import { formatCurrency } from "@/lib/utils";

/**
 * Issues a real Stripe refund from the admin order screen.
 * Supports full, partial, and item-level refunds.
 *
 * IMPORTANT: For Stripe Connect accounts, the refund MUST use
 * reverse_transfer: true so it's funded from the restaurant's
 * connected account, not the platform account.
 *
 * `refundedItemIds` (optional) records WHICH order items this refund
 * covered, by stamping OrderItem.refundedAt — so the refund modal can
 * grey those items out on a later partial refund. A refund that clears
 * the order's full remaining balance marks every not-yet-refunded item.
 */
export async function issueOrderRefund(args: {
  orderId: string;
  restaurantId: string;
  adminUserId: string;
  amountCents: number;
  refundedItemIds?: string[];
}) {
  const { orderId, restaurantId, adminUserId, amountCents, refundedItemIds } = args;

  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: {
      payment: true,
      restaurant: true,
      school: true,
      deliveryDate: true,
      student: true,
      items: true,
    },
  });

  if (!order) throw new Error("Order not found.");
  // A PARTIALLY_REFUNDED order can still be refunded further (up to the
  // remaining balance), so both PAID and PARTIALLY_REFUNDED are valid
  // starting states. Anything else (REFUNDED, CANCELLED, PENDING) is not.
  if (
    order.status !== OrderStatus.PAID &&
    order.status !== OrderStatus.PARTIALLY_REFUNDED
  ) {
    throw new Error("Only paid orders can be refunded.");
  }

  // Refundable = order total minus whatever has already been refunded.
  const refundableAmountCents = order.totalCents - order.refundAmountCents;
  if (amountCents <= 0 || amountCents > refundableAmountCents) {
    throw new Error(
      `Refund amount must be between $0.01 and ${formatCurrency(refundableAmountCents)}.`
    );
  }

  const paymentIntentId =
    order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;
  // "Full" here means this refund clears the entire remaining balance —
  // which is true whether or not earlier partial refunds happened.
  const isFullRefund = amountCents === refundableAmountCents;

  // Issue the Stripe refund.
  if (stripe && paymentIntentId) {
    try {
      await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: amountCents,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            isFullRefund: isFullRefund ? "true" : "false",
            issuedByAdminId: adminUserId,
          },
        },
        {
          idempotencyKey: `refund-${orderId}-${amountCents}-${Date.now()}`,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Stripe error";
      throw new Error(`Stripe refund failed: ${message}`);
    }
  }

  const now = new Date();
  const newRefundAmountCents = order.refundAmountCents + amountCents;
  const newStatus =
    newRefundAmountCents >= order.totalCents
      ? OrderStatus.REFUNDED
      : OrderStatus.PARTIALLY_REFUNDED;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        refundedAt: now,
        refundAmountCents: newRefundAmountCents,
        refundedByAdminId: adminUserId,
      },
      include: {
        school: true,
        deliveryDate: true,
        student: true,
        items: true,
        payment: true,
      },
    });

    // Record which line items this refund covered so the refund modal
    // can grey them out next time. If the order is now fully refunded,
    // every remaining item is implicitly covered.
    if (newStatus === OrderStatus.REFUNDED) {
      await tx.orderItem.updateMany({
        where: { orderId, refundedAt: null },
        data: { refundedAt: now },
      });
    } else if (refundedItemIds && refundedItemIds.length > 0) {
      await tx.orderItem.updateMany({
        where: { orderId, id: { in: refundedItemIds }, refundedAt: null },
        data: { refundedAt: now },
      });
    }

    if (result.payment) {
      await tx.payment.update({
        where: { orderId },
        data: {
          status:
            newStatus === OrderStatus.REFUNDED
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PAID, // stays PAID for partial refunds
          refundedAt: now,
        },
      });
    }

    return result;
  });

  const refundSummary = isFullRefund
    ? `Admin issued full refund of ${formatCurrency(amountCents)} to order ${updated.orderNumber}`
    : `Admin issued partial refund of ${formatCurrency(amountCents)} (${formatCurrency(newRefundAmountCents)} total refunded) to order ${updated.orderNumber}`;

  await logActivity({
    restaurantId,
    adminUserId,
    entityType: "ORDER",
    entityId: orderId,
    action: "REFUNDED",
    summary: refundSummary,
    metadata: {
      orderNumber: order.orderNumber,
      refundAmountCents: amountCents,
      totalRefundedCents: newRefundAmountCents,
      isFullRefund,
    },
  });

  return updated;
}
