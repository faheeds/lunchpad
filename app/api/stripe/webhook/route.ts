import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/payments/stripe";
import { markOrderPaidByCheckoutSession } from "@/lib/orders";
import { sendOrderConfirmationEmail, scheduleCutoffReminderEmail } from "@/lib/email/service";
import { isDuplicateWebhookEvent } from "@/lib/payments/webhook";
import { markWeeklyBatchPaidByCheckoutSession } from "@/lib/weekly-checkout";

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
    const message = error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const alreadyProcessed = await prisma.processedWebhookEvent.findUnique({
    where: { eventId: event.id }
  });

  if (isDuplicateWebhookEvent(alreadyProcessed?.eventId, event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
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
        if (session.metadata?.checkoutType === "weekly_batch") {
          const result = await markWeeklyBatchPaidByCheckoutSession(
            session.id,
            String(session.payment_intent || ""),
            session.amount_total ?? null
          );
          for (const orderId of result.createdOrderIds) {
            try {
              await sendOrderConfirmationEmail(orderId);
            } catch {
              // Email failures are logged and can be retried in admin.
            }
          }
        } else {
          const order = await markOrderPaidByCheckoutSession(
            session.id,
            String(session.payment_intent || ""),
            session.amount_total ?? null
          );
          try {
            await sendOrderConfirmationEmail(order.id);
          } catch {
            // Email failures are logged and can be retried in admin.
          }
          // Schedule a reminder 24h before cutoff - best-effort, never throws.
          scheduleCutoffReminderEmail(order.id).catch(() => {});
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
