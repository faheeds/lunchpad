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
  /** Unix timestamp (seconds) for when the Checkout session expires.
   *  Used by the order-edit increase flow to align session expiry with
   *  the delivery cutoff. Must be at least 30 minutes in the future.
   *  Omit to use Stripe's default (24 hours). */
  expiresAt?: number;
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
    ...(args.expiresAt ? { expires_at: args.expiresAt } : {}),
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

type OrderEditCheckoutArgs = {
  orderId: string;
  orderNumber: string;
  parentEmail: string;
  deltaCents: number;
  newTotalCents: number;
  /** Serialized JSON of the pending item state — stored in session metadata
   *  and applied to OrderItem rows by the webhook on payment confirmation. */
  newItemsJson: string;
  stripeAccountId?: string | null;
  /** Unix timestamp (seconds) — Stripe session expires at this time.
   *  Set to min(cutoffAt, now+24h-60s) so the session cannot be completed
   *  after the delivery cutoff. Must be ≥ 30 minutes in the future. */
  expiresAt: number;
  /** Where to redirect after successful payment. */
  successUrl?: string;
  /** Where to redirect if customer cancels. */
  cancelUrl?: string;
};

/**
 * Create a Stripe Checkout session for the delta amount of an order
 * increase-edit. Reuses the same Connect-aware session logic as the
 * original order checkout — same platform fee, same transfer routing.
 *
 * The session's metadata carries checkoutType="order_edit_increase" so
 * the webhook handler can distinguish it from a new-order session.
 *
 * IMPORTANT: expires_at is mandatory here (unlike new-order sessions)
 * because the session must not outlive the delivery cutoff.
 */
export async function createOrderEditCheckoutSession(args: OrderEditCheckoutArgs) {
  return createSession({
    parentEmail: args.parentEmail,
    successUrl: args.successUrl ?? `${env.APP_BASE_URL}/account/orders/${args.orderId}?edit_paid=1`,
    cancelUrl: args.cancelUrl ?? `${env.APP_BASE_URL}/account/orders/${args.orderId}?edit_cancelled=1`,
    metadata: {
      checkoutType: "order_edit_increase",
      orderId: args.orderId,
      orderNumber: args.orderNumber,
      newTotalCents: String(args.newTotalCents),
      newItemsJson: args.newItemsJson,
    },
    lineItems: [
      {
        name: `Order update — ${args.orderNumber}`,
        description: "Add-ons for your existing order",
        amountCents: args.deltaCents,
      },
    ],
    stripeAccountId: args.stripeAccountId,
    expiresAt: args.expiresAt,
  });
}