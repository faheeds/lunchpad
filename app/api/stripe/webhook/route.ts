import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/payments/stripe";
import { markOrderPaidByCheckoutSession } from "@/lib/orders";
import {
  sendOrderConfirmationEmail,
  sendOrderModifiedEmail,
  sendWeeklyOrderConfirmationEmail,
  sendSubscriptionChangedEmail,
} from "@/lib/email/service";
import { isDuplicateWebhookEvent } from "@/lib/payments/webhook";
import { markWeeklyBatchPaidByCheckoutSession } from "@/lib/weekly-checkout";
import { logActivity } from "@/lib/activity";
import { formatCurrency } from "@/lib/utils";
import { sendPushForOrder, sendPushToParent } from "@/lib/push/service";

export async function POST(request: Request) {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    // Try the Connect webhook secret if the primary secret fails
    if (env.STRIPE_CONNECT_WEBHOOK_SECRET) {
      try {
        event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_CONNECT_WEBHOOK_SECRET);
      } catch (connectError) {
        const message = connectError instanceof Error ? connectError.message : "Invalid webhook signature.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    } else {
      const message = error instanceof Error ? error.message : "Invalid webhook signature.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const alreadyProcessed = await prisma.processedWebhookEvent.findUnique({
    where: { eventId: event.id }
  });

  if (isDuplicateWebhookEvent(alreadyProcessed?.eventId, event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // ── Stripe Connect: account status updates ────────────────────────────────
    if (event.type === "account.updated") {
      const account = event.data.object as import("stripe").Stripe.Account;
      if (account.id) {
        await prisma.restaurant.updateMany({
          where: { stripeAccountId: account.id },
          data: {
            stripeOnboardingComplete: account.charges_enabled === true,
          },
        });
      }
    }

    // ── Subscription lifecycle ────────────────────────────────────────────────
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const restaurantId = sub.metadata?.restaurantId;
      const plan = sub.metadata?.plan;
      if (restaurantId) {
        const status = sub.status === "active" ? "ACTIVE"
          : sub.status === "past_due" ? "PAST_DUE"
          : sub.status === "paused" ? "PAUSED"
          : sub.status === "canceled" ? "CANCELLED"
          : "TRIAL";
        await prisma.restaurant.update({
          where: { id: restaurantId },
          data: {
            stripeSubscriptionId: sub.id,
            subscriptionStatus: status as import("@prisma/client").SubscriptionStatus,
            ...(plan && ["STARTER", "GROWTH", "SCALE"].includes(plan)
              ? { plan: plan as import("@prisma/client").RestaurantPlan }
              : {}),
          },
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const restaurantId = sub.metadata?.restaurantId;
      if (restaurantId) {
        await prisma.restaurant.update({
          where: { id: restaurantId },
          data: {
            subscriptionStatus: "CANCELLED",
            stripeSubscriptionId: null,
          },
        });
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.id) {
        if (session.metadata?.checkoutType === "subscription") {
          // Restaurant SaaS subscription — activate the plan on the Restaurant row.
          const restaurantId = session.metadata.restaurantId;
          const plan = session.metadata.plan as "STARTER" | "GROWTH" | "SCALE" | undefined;
          const stripeSubscriptionId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
          if (restaurantId && plan && stripeSubscriptionId) {
            // Capture previous plan before overwriting so we can include it in the email.
            const before = await prisma.restaurant.findUnique({
              where: { id: restaurantId },
              select: { plan: true },
            });
            await prisma.restaurant.update({
              where: { id: restaurantId },
              data: {
                plan,
                subscriptionStatus: "ACTIVE",
                stripeSubscriptionId,
                trialEndsAt: null,
              },
            });
            // Best-effort confirmation email with proration details.
            sendSubscriptionChangedEmail(restaurantId, before?.plan ?? "FREE", plan).catch(() => {});
          }
        } else if (session.metadata?.checkoutType === "order_edit_increase") {
          // ── Order increase-edit: delta payment confirmed ──────────────────
          const { orderId, newTotalCents: newTotalCentsStr, newItemsJson } = session.metadata;
          const newTotalCents = parseInt(newTotalCentsStr ?? "0", 10);
          const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

          const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true, payment: true },
          });

          if (!order) {
            // No matching order — orphan webhook (money with no order). Refund.
            let orphanRefunded = false;
            let orphanRefundError: string | null = null;
            if (stripe && paymentIntentId) {
              try {
                await stripe.refunds.create(
                  { payment_intent: paymentIntentId },
                  { idempotencyKey: `edit-orphan-${session.id}` }
                );
                orphanRefunded = true;
              } catch (e) {
                orphanRefundError = e instanceof Error ? e.message : String(e);
              }
            }
            await logActivity({
              restaurantId: "unknown",
              entityType: "ORDER",
              entityId: orderId ?? "unknown",
              action: "MODIFIED",
              summary: orphanRefunded
                ? `[order_edit_orphan] No order found for edit session ${session.id} — refunded ${formatCurrency(session.amount_total ?? 0)}`
                : `[order_edit_orphan] No order found for edit session ${session.id} — REFUND FAILED (${orphanRefundError ?? "unknown error"}) — manual action required`,
              metadata: { sessionId: session.id, orderId, paymentIntentId, reason: "order_not_found", orphanRefunded, ...(orphanRefundError ? { orphanRefundError } : {}) },
            });
          } else if (order.pendingEditCheckoutSession === null && order.deltaPaymentIntentId === paymentIntentId) {
            // Duplicate webhook — already finalized. No-op.
            // IMPORTANT: this guard must come before the session-mismatch check
            // below. After finalization, pendingEditCheckoutSession is null, so
            // null !== session.id would be true and incorrectly trigger an orphan
            // refund without this early-return guard.
          } else if (order.pendingEditCheckoutSession !== session.id) {
            // Orphan webhook — session doesn't match the order's pending edit.
            // Real money arrived but we can't apply it. Refund immediately.
            let orphanRefunded = false;
            let orphanRefundError: string | null = null;
            if (stripe && paymentIntentId) {
              try {
                await stripe.refunds.create(
                  { payment_intent: paymentIntentId },
                  { idempotencyKey: `edit-orphan-${session.id}` }
                );
                orphanRefunded = true;
              } catch (e) {
                orphanRefundError = e instanceof Error ? e.message : String(e);
              }
            }
            await logActivity({
              restaurantId: order.restaurantId,
              entityType: "ORDER",
              entityId: order.id,
              action: "MODIFIED",
              summary: orphanRefunded
                ? `[order_edit_orphan] Stale edit session ${session.id} for order ${order.orderNumber} — refunded ${formatCurrency(session.amount_total ?? 0)}`
                : `[order_edit_orphan] Stale edit session ${session.id} for order ${order.orderNumber} — REFUND FAILED (${orphanRefundError ?? "unknown error"}) — manual action required`,
              metadata: {
                sessionId: session.id,
                expectedSession: order.pendingEditCheckoutSession,
                paymentIntentId,
                reason: "session_mismatch",
                orphanRefunded,
                ...(orphanRefundError ? { orphanRefundError } : {}),
              },
            });
          } else {
            // Happy path: finalize the increase-edit.
            let pendingItems: {
              additions: string[];
              removals: string[];
              allergyNotes: string | null;
              dietaryNotes: string | null;
              specialInstructions: string | null;
              lineTotalCents: number;
            } | null = null;
            try {
              pendingItems = JSON.parse(newItemsJson ?? "null");
            } catch { /* malformed JSON — proceed without item update */ }

            const oldTotalCents = order.totalCents;
            const deltaCents = newTotalCents - oldTotalCents;
            const item = order.items[0];

            await prisma.$transaction(async (tx) => {
              if (pendingItems && item) {
                await tx.orderItem.update({
                  where: { id: item.id },
                  data: {
                    additions: pendingItems.additions,
                    removals: pendingItems.removals,
                    allergyNotes: pendingItems.allergyNotes,
                    dietaryNotes: pendingItems.dietaryNotes,
                    specialInstructions: pendingItems.specialInstructions,
                    lineTotalCents: pendingItems.lineTotalCents,
                  },
                });
              }

              await tx.order.update({
                where: { id: order.id },
                data: {
                  subtotalCents: newTotalCents,
                  totalCents: newTotalCents,
                  pendingEditTotalCents: null,
                  pendingEditCheckoutSession: null,
                  pendingEditCreatedAt: null,
                  deltaPaymentIntentId: paymentIntentId,
                  deltaAmountCents: deltaCents,
                },
              });

              if (order.payment) {
                await tx.payment.update({
                  where: { orderId: order.id },
                  data: {
                    amountCents: order.payment.amountCents + deltaCents,
                    // providerPaymentIntent intentionally left as-is (original charge)
                  },
                });
              }
            });

            await logActivity({
              restaurantId: order.restaurantId,
              entityType: "ORDER",
              entityId: order.id,
              action: "MODIFIED",
              summary: `Order ${order.orderNumber} increase-edit confirmed — total updated to ${formatCurrency(newTotalCents)} (+${formatCurrency(deltaCents)})`,
              metadata: {
                orderNumber: order.orderNumber,
                oldTotalCents,
                newTotalCents,
                deltaCents,
                deltaPaymentIntentId: paymentIntentId,
              },
            });

            // Best-effort "your order has been updated" email.
            sendOrderModifiedEmail(order.id, order.restaurantId).catch(() => {});
            sendPushForOrder(order.id, { title: "Order updated", body: "Your order has been updated.", data: { screen: "order", orderId: order.id } }).catch(() => {});
          }
        } else if (session.metadata?.checkoutType === "weekly_batch") {
          const result = await markWeeklyBatchPaidByCheckoutSession(
            session.id,
            String(session.payment_intent || ""),
            session.amount_total ?? null
          );
          // A weekly batch becomes several Order rows (one per delivery
          // date) but it is a SINGLE payment — send one combined weekly
          // confirmation email covering every day, not one per order.
          if (result.createdOrderIds.length > 0) {
            const sample = await prisma.order.findUnique({
              where: { id: result.createdOrderIds[0] },
              select: { restaurantId: true, parentUserId: true },
            });
            if (sample) {
              try {
                await sendWeeklyOrderConfirmationEmail(
                  result.createdOrderIds,
                  sample.restaurantId
                );
              } catch {
                // Email failures are logged and can be retried in admin.
              }
              if (sample.parentUserId) {
                sendPushToParent(sample.parentUserId, { title: "Weekly orders confirmed!", body: "Your lunch orders for the week are set.", data: { screen: "weekly" } }).catch(() => {});
              }
            }
          }
        } else {
          const order = await markOrderPaidByCheckoutSession(
            session.id,
            String(session.payment_intent || ""),
            session.amount_total ?? null
          );
          try {
            await sendOrderConfirmationEmail(order.id, order.restaurantId);
          } catch {
            // Email failures are logged and can be retried in admin.
          }
          sendPushForOrder(order.id, { title: "Order confirmed!", body: "Your lunch order is on its way.", data: { screen: "order", orderId: order.id } }).catch(() => {});
          // Previously: scheduleCutoffReminderEmail(order.id, ...). Removed
          // because that sent a "Ordering closes soon — Place Order Now"
          // reminder to the parent who had JUST placed and paid for an
          // order. The cutoff reminder's audience is parents who have NOT
          // yet ordered for the delivery date; firing it on the payment
          // webhook targets the wrong cohort.
        }
      }
    }

    await prisma.processedWebhookEvent.create({
      data: {
        provider: "stripe",
        eventId: event.id,
        eventType: event.type
      }
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
