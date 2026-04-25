import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/payments/stripe";
import { markOrderPaidByCheckoutSession } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
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
