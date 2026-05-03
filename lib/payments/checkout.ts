import Stripe from "stripe";
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
  /** Stripe Connect: the restaurant's connected account ID (acct_xxx). */
  stripeAccountId?: string | null;
};

type OrderCheckoutArgs = {
  orderId: string;
  orderNumber: string;
  parentEmail: string;
  lineItems: SharedLineItem[];
  stripeAccountId?: string | null;
};

type WeeklyBatchCheckoutArgs = {
  batchId: string;
  parentEmail: string;
  lineItems: SharedLineItem[];
  stripeAccountId?: string | null;
};

async function createSession(args: SharedCheckoutArgs) {
  if (!stripe) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to continue.");
  }

  const totalCents = args.lineItems.reduce((sum, item) => sum + item.amountCents, 0);

  // Build the payment_intent_data only when the restaurant has connected their
  // Stripe account — funds are then sent directly to the restaurant and
  // LunchPad retains application_fee_amount as its platform cut.
  let paymentIntentData: Stripe.Checkout.SessionCreateParams["payment_intent_data"] | undefined;
  if (args.stripeAccountId) {
    const feePercent = env.PLATFORM_FEE_PERCENT / 100;
    const feeCents = Math.max(1, Math.round(totalCents * feePercent));
    paymentIntentData = {
      application_fee_amount: feeCents,
      transfer_data: { destination: args.stripeAccountId },
    };
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: args.parentEmail,
    billing_address_collection: "required",
    automatic_tax: { enabled: !args.stripeAccountId }, // tax only on direct charges; skip for Connect
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: args.metadata,
    ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
    line_items: args.lineItems.map((item) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        product_data: { name: item.name, description: item.description },
        unit_amount: item.amountCents,
      },
    })),
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
      orderNumber: args.orderNumber,
    },
    lineItems: args.lineItems,
    stripeAccountId: args.stripeAccountId,
  });
}

export async function createWeeklyStripeCheckoutSession(args: WeeklyBatchCheckoutArgs) {
  return createSession({
    parentEmail: args.parentEmail,
    successUrl: `${env.APP_BASE_URL}/checkout/success?batch=${args.batchId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${env.APP_BASE_URL}/account?cancelled=1`,
    metadata: {
      checkoutType: "weekly_batch",
      batchId: args.batchId,
    },
    lineItems: args.lineItems,
    stripeAccountId: args.stripeAccountId,
  });
}

export function getPaymentSummary(amountCents: number) {
  return formatCurrency(amountCents);
}
