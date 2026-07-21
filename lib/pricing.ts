/**
 * Single source of truth for line-item totaling: base price (from the picked
 * size, or the menu item's basePriceCents when no size is picked) plus the
 * summed price deltas of any selected add-on options.
 */
export function resolveLineItemPrice(input: {
  basePriceCents: number;
  size?: { priceCents: number } | null;
  additions?: ReadonlyArray<{ priceDeltaCents: number }>;
}): number {
  const base = input.size ? input.size.priceCents : input.basePriceCents;
  const additions = input.additions ?? [];
  let sum = base;
  for (const a of additions) sum += a.priceDeltaCents;
  return sum;
}
