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
  /** Optional discount to apply at Stripe Checkout. We create a one-time
   *  coupon for this exact amount and attach it via the `discounts` field
   *  so the customer sees the discount line natively on the Stripe page
   *  + the resulting Stripe Receipt. Set to 0 / omitted = no discount. */
  discountCents?: number;
  /** Human-readable label that shows up as the coupon name on Stripe
   *  (and on the customer receipt). Defaults to "Discount". */
  discountLabel?: string;
};

type OrderCheckoutArgs = {
  orderId: string;
  orderNumber: string;
  parentEmail: string;
  lineItems: SharedLineItem[];
  stripeAccountId?: string | null;
  /** Optional overrides — used by the mobile API to redirect back into the app */
  successUrl?: string;
  cancelUrl?: string;
  /** See discountCents on SharedCheckoutArgs. */
  discountCents?: number;
  discountLabel?: string;
};

type WeeklyBatchCheckoutArgs = {
  batchId: string;
  parentEmail: string;
  lineItems: SharedLineItem[];
  stripeAccountId?: string | null;
  /** Optional overrides so the redirect lands on the tenant subdomain. */
  successUrl?: string;
  cancelUrl?: string;
};

async function createSession(args: SharedCheckoutArgs) {
  if (!stripe) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to continue.");
  }

  const grossCents = args.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const discountCents = args.discountCents && args.discountCents > 0 ? args.discountCents : 0;
  // Clamp the discount to the gross — Stripe rejects a coupon larger than
  // the subtotal at the API level, but we belt-and-suspenders here too.
  const safeDiscountCents = Math.min(discountCents, grossCents);
  const netCents = grossCents - safeDiscountCents;

  // Build the payment_intent_data only when the restaurant has connected their
  // Stripe account — funds are then sent directly to the restaurant and
  // LunchPad retains application_fee_amount as its platform cut. Platform
  // fee is computed off the NET (post-discount) charge so the operator
  // doesn't eat a fee on dollars they never received.
  let paymentIntentData: Stripe.Checkout.SessionCreateParams["payment_intent_data"] | undefined;
  if (args.stripeAccountId) {
    const feePercent = env.PLATFORM_FEE_PERCENT / 100;
    const feeCents = Math.max(1, Math.round(netCents * feePercent));
    paymentIntentData = {
      application_fee_amount: feeCents,
      transfer_data: { destination: args.stripeAccountId },
    };
  }

  // If there's a discount, mint a one-time Stripe coupon and attach it.
  // We create per-checkout coupons rather than caching by discountId
  // because (a) the discount amount can change between sessions if
  // percentages apply to different subtotals, and (b) coupons are free
  // to create on Stripe so the simplicity wins. The coupon is single-use
  // (`max_redemptions: 1`) so it can't be reused outside this session.
  let discountStripeArg: Stripe.Checkout.SessionCreateParams["discounts"] | undefined;
  if (safeDiscountCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: safeDiscountCents,
      currency: "usd",
      duration: "once",
      max_redemptions: 1,
      name: args.discountLabel ?? "Discount",
    });
    discountStripeArg = [{ coupon: coupon.id }];
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: args.parentEmail,
    billing_address_collection: "required",
    // `automatic_tax` and `discounts` interact: Stripe requires
    // `customer_update` to be allow-listed when both are on. Keep tax off
    // for Connect (already the policy) so the combination stays simple.
    automatic_tax: { enabled: !args.stripeAccountId }, // tax only on direct charges; skip for Connect
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: {
      ...args.metadata,
      ...(safeDiscountCents > 0 ? { discountCents: String(safeDiscountCents) } : {}),
    },
    ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
    ...(discountStripeArg ? { discounts: discountStripeArg } : {}),
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
    successUrl: args.successUrl ?? `${env.APP_BASE_URL}/checkout/success?order=${args.orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: args.cancelUrl ?? `${env.APP_BASE_URL}/order?cancelled=1`,
    metadata: {
      checkoutType: "order",
      orderId: args.orderId,
      orderNumber: args.orderNumber,
    },
    lineItems: args.lineItems,
    stripeAccountId: args.stripeAccountId,
    discountCents: args.discountCents,
    discountLabel: args.discountLabel,
  });
}

export async function createWeeklyStripeCheckoutSession(args: WeeklyBatchCheckoutArgs) {
  return createSession({
    parentEmail: args.parentEmail,
    successUrl: args.successUrl ?? `${env.APP_BASE_URL}/checkout/success?batch=${args.batchId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: args.cancelUrl ?? `${env.APP_BASE_URL}/account?cancelled=1`,
    metadata: {
      checkoutType: "weekly_batch",
      batchId: args.batchId,
    },
    lineItems: args.lineItems,
    stripeAccountId: args.stripeAccountId,
  });
}