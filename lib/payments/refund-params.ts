import type Stripe from "stripe";
import { stripe } from "@/lib/payments/stripe";
import { logWarn } from "@/lib/log";

/**
 * Create a Stripe refund, reversing the Connect transfer when the original
 * charge was a destination charge.
 *
 * Without reverse_transfer, Stripe funds the refund from the PLATFORM balance
 * while the restaurant keeps the money that was transferred to it, so every
 * refund would cost F5H the full amount. With it, the refund is pulled back
 * from the connected account in proportion to the amount refunded. The
 * application fee is kept (refund_application_fee is left off): Stripe does
 * not return its own processing fee on refunds either.
 *
 * Charges with no transfer (older orders, platform-only restaurants) are
 * refunded exactly as before.
 */
export async function createRefund(
  params: Stripe.RefundCreateParams,
  options?: Stripe.RequestOptions
): Promise<Stripe.Refund> {
  if (!stripe) throw new Error("Stripe is not configured.");

  const finalParams: Stripe.RefundCreateParams = { ...params };
  const paymentIntentId = typeof params.payment_intent === "string" ? params.payment_intent : null;

  if (paymentIntentId && finalParams.reverse_transfer === undefined) {
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.transfer_data?.destination) {
        finalParams.reverse_transfer = true;
      }
    } catch (err) {
      // Never block a customer's refund on this lookup, but make it visible.
      logWarn("refund_transfer_lookup_failed", {
        paymentIntentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return stripe.refunds.create(finalParams, options);
}
