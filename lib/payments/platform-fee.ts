import { env } from "@/lib/env";

/**
 * LunchPad's application fee on a destination charge.
 *
 * On a destination charge the PLATFORM (F5H) is the merchant of record and
 * pays Stripe's processing fees out of its own balance: 2.9% + 30c on the
 * full charge (tax included), plus Stripe Tax at 0.5%. The application fee
 * is what funds that, so it needs a flat component. A percentage-only fee
 * loses money on small tickets because the 30c is a bigger share of them.
 *
 *   fee = round(net * PLATFORM_FEE_PERCENT / 100) + PLATFORM_FEE_FIXED_CENTS
 *
 * `netCents` is the post-discount, pre-tax subtotal (what the restaurant
 * actually earns). The fee never exceeds it.
 */
export function computePlatformFeeCents(
  netCents: number,
  percent: number = env.PLATFORM_FEE_PERCENT,
  fixedCents: number = env.PLATFORM_FEE_FIXED_CENTS
): number {
  if (netCents <= 0) return 0;
  const fee = Math.round((netCents * percent) / 100) + Math.max(0, Math.round(fixedCents));
  return Math.min(netCents, Math.max(1, fee));
}
