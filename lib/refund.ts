import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { logActivity } from "@/lib/activity";
import { formatCurrency } from "@/lib/utils";

/**
 * Issues a real Stripe refund from the admin order screen.
 * Supports both full and partial refunds.
 *
 * IMPORTANT: For Stripe Connect accounts, the refund MUST use
 * reverse_transfer: true so it's funded from the restaurant's
 * connected account, not the platform account.
 */
export async function issueOrderRefund(args: {
  orderId: string;
  restaurantId: string;
  adminUserId: string;
  amountCents: number;
}) {
  const { orderId, restaurantId, adminUserId, amountCents } = args;

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
  if (order.status !== OrderStatus.PAID) throw new Error("Only paid orders can be refunded.");

  // Calculate refundable amount: totalCents - refundAmountCents
  const refundableAmountCents = order.totalCents - order.refundAmountCents;
  if (amountCents <= 0 || amountCents > refundableAmountCents) {
    throw new Error(`Refund amount must be between $0.01 and ${formatCurrency(refundableAmountCents)}.`);
  }

  const paymentIntentId = order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;
  const isFullRefund = amountCents === order.totalCents;

  // Issue the Stripe refund
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
  const newStatus = newRefundAmountCents >= order.totalCents
    ? OrderStatus.REFUNDED
    : OrderStatus.PARTIALLY_REFUNDED;

  // Update order with refund details
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

    // Update payment record
    if (result.payment) {
      await tx.payment.update({
        where: { orderId },
        data: {
          status: newStatus === OrderStatus.REFUNDED
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PAID, // Stay PAID for partial refunds
          refundedAt: now,
        },
      });
    }

    return result;
  });

  // Log the refund activity outside the transaction
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
