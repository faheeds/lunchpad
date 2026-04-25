import { stripe } from "@/lib/payments/stripe";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/utils";

type SharedLineItem = {
  name: string;
  description: string;
  amountCents: number;
};

type SharedCheckoutArgs = {
  parentEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  lineItems: SharedLineItem[];
};

type OrderCheckoutArgs = {
  orderId: string;
  orderNumber: string;
  parentEmail: string;
  lineItems: SharedLineItem[];
};

type WeeklyBatchCheckoutArgs = {
  batchId: string;
  parentEmail: string;
  lineItems: SharedLineItem[];
};

async function createSession(args: SharedCheckoutArgs) {
  if (!stripe) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to continue.");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: args.parentEmail,
    billing_address_collection: "required",
    automatic_tax: {
      enabled: true
    },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: args.metadata,
    line_items: args.lineItems.map((item) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
          description: item.description
        },
        unit_amount: item.amountCents
      }
    }))
  });
}

export async function createStripeCheckoutSession(args: OrderCheckoutArgs) {
  return createSession({
    parentEmail: args.parentEmail,
    successUrl: `${env.APP_BASE_URL}/checkout/success?order=${args.orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${env.APP_BASE_URL}/order?cancelled=1`,
    metadata: {
      checkoutType: "order",
      orderId: args.orderId,
      orderNumber: args.orderNumber
    },
    lineItems: args.lineItems
  });
}

export async function createWeeklyStripeCheckoutSession(args: WeeklyBatchCheckoutArgs) {
  return createSession({
    parentEmail: args.parentEmail,
    successUrl: `${env.APP_BASE_URL}/checkout/success?batch=${args.batchId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${env.APP_BASE_URL}/account?cancelled=1`,
    metadata: {
      checkoutType: "weekly_batch",
      batchId: args.batchId
    },
    lineItems: args.lineItems
  });
}

export function getPaymentSummary(amountCents: number) {
  return formatCurrency(amountCents);
}
