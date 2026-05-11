/**
 * Discount engine — the single place where "can this discount apply to
 * this order, and if so for how much?" gets answered.
 *
 * Design rules:
 *  - Pure function shape where possible: pass in everything needed, get
 *    back a decision. Easier to test, easier to call from server actions,
 *    server-rendered review pages, and the mobile API alike.
 *  - Tenant scoping is the caller's responsibility — pass restaurantId
 *    everywhere and let Prisma where-clauses lock it down. The engine
 *    never reaches across tenants.
 *  - Best-effort recording: applying a discount writes a Redemption row
 *    plus an activity-log entry. If the activity-log write fails the
 *    redemption still stands (auditing should never block money flow).
 *  - Stacking is intentionally conservative in v1: at most one
 *    auto-discount + at most one promo code per order. We'll generalize
 *    when we add loyalty in a later phase.
 */

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type {
  Discount,
  DiscountKind,
  DiscountScope,
  DiscountTemplate,
} from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

/** What the engine needs to know about a cart to score discounts.
 *  This shape is deliberately small + serializable so it's cheap to
 *  build from any caller (web order form, mobile API, admin manual
 *  order creation). */
export interface CartContext {
  restaurantId: string;
  /** Resolved school id of the delivery date the customer picked. */
  schoolId: string;
  /** Resolved delivery date (UTC). We derive the local weekday from this
   *  using the school's timezone — but for slice 1 the engine treats
   *  weekdays naively against the raw Date. Slice 2 wires in the
   *  timezone-aware version. */
  deliveryDate: Date;
  /** Parent user placing the order. Null for guest checkouts (we still
   *  honor automatic order-level discounts but skip per-user redemption
   *  caps). */
  parentUserId: string | null;
  /** One entry per unit. Identical lines come through as N entries (the
   *  cart UI collapses them with qty steppers but the engine sees
   *  unit-level rows — same shape as the eventual OrderItem rows). */
  lines: CartLine[];
}

export interface CartLine {
  menuItemId: string;
  /** Operator-set category from MenuItem.category. Required for
   *  category-scoped discounts. Null/undefined = uncategorized. */
  category?: string | null;
  /** Per-unit total (base + additions). The whole-line subtotal is
   *  just this number — quantity is 1 because callers expand qty into
   *  N lines. */
  lineTotalCents: number;
}

/** Result of evaluating a single discount against a cart. */
export interface DiscountEvaluation {
  discount: Discount;
  /** Computed $ amount this discount would deduct. 0 means it didn't
   *  apply (either ineligible or the math came out to nothing). */
  amountCents: number;
  /** Human-readable reason this discount was rejected. Empty when
   *  amountCents > 0 (i.e. the discount applied). */
  reason: string | null;
}

/** Final picked discount(s) for a cart — at most one auto + one code. */
export interface AppliedDiscounts {
  auto: DiscountEvaluation | null;
  code: DiscountEvaluation | null;
  /** Total amount that will be deducted from the order subtotal. */
  totalDiscountCents: number;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate every active discount for this tenant against the cart, then
 * apply the best combination per the stacking rules. Returns whichever
 * single auto-discount won + whichever code was explicitly entered.
 *
 * If `code` is non-empty and doesn't match any valid discount, returns
 * the auto-discount only — the caller is responsible for surfacing the
 * "invalid code" message back to the customer (we don't throw because
 * a typo shouldn't break checkout).
 */
export async function pickApplicableDiscounts(args: {
  cart: CartContext;
  code?: string | null;
}): Promise<AppliedDiscounts> {
  const { cart, code } = args;

  const activeDiscounts = await prisma.discount.findMany({
    where: {
      restaurantId: cart.restaurantId,
      isActive: true,
      // Window filter — let the engine still evaluate, but skip
      // expired ones up front to save work on big lists.
      OR: [
        { startsAt: null },
        { startsAt: { lte: new Date() } },
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: new Date() } },
          ],
        },
      ],
    },
  });

  // Partition auto vs. code. Auto candidates compete with each other;
  // the customer-typed code is matched separately.
  const autos = activeDiscounts.filter((d) => d.code === null);
  const codedPool = activeDiscounts.filter((d) => d.code !== null);

  // Pre-compute parent's prior order count once if anyone needs it
  // (only firstOrderOnly discounts do, so skip the query if none).
  const anyFirstOrder = activeDiscounts.some((d) => d.firstOrderOnly);
  let priorOrderCount = 0;
  if (anyFirstOrder && cart.parentUserId) {
    priorOrderCount = await prisma.order.count({
      where: {
        parentUserId: cart.parentUserId,
        restaurantId: cart.restaurantId,
        status: { in: ["PAID"] },
      },
    });
  }

  // Pre-compute per-user redemption counts for code candidates that have
  // maxRedemptionsPerUser. One query covers them all.
  const perUserCounts = new Map<string, number>();
  if (cart.parentUserId) {
    const grouped = await prisma.discountRedemption.groupBy({
      by: ["discountId"],
      where: { parentUserId: cart.parentUserId },
      _count: { _all: true },
    });
    for (const row of grouped) perUserCounts.set(row.discountId, row._count._all);
  }

  const evalContext: EvalContext = {
    cart,
    priorOrderCount,
    perUserCounts,
  };

  // Auto: evaluate all, pick the single highest discount $ amount.
  let bestAuto: DiscountEvaluation | null = null;
  for (const d of autos) {
    const evaluated = evaluate(d, evalContext);
    if (evaluated.amountCents > 0) {
      if (!bestAuto || evaluated.amountCents > bestAuto.amountCents) {
        bestAuto = evaluated;
      }
    }
  }

  // Code: match exact code (case-insensitive — friendlier UX).
  let codeWin: DiscountEvaluation | null = null;
  if (code && code.trim()) {
    const normalized = code.trim().toUpperCase();
    const match = codedPool.find((d) => d.code?.toUpperCase() === normalized);
    if (match) {
      const evaluated = evaluate(match, evalContext);
      if (evaluated.amountCents > 0) codeWin = evaluated;
    }
  }

  // Stacking: if both auto and code win and the code's `allowStackingWithCode`
  // is true we keep both. Otherwise the code (customer's explicit choice)
  // takes precedence over the silent auto-applied one.
  if (bestAuto && codeWin) {
    if (!codeWin.discount.allowStackingWithCode) {
      bestAuto = null;
    }
  }

  const totalDiscountCents =
    (bestAuto?.amountCents ?? 0) + (codeWin?.amountCents ?? 0);

  return {
    auto: bestAuto,
    code: codeWin,
    totalDiscountCents,
  };
}

/**
 * Record a discount as applied to an order. Called from the order
 * creation transaction so the redemption row and order row are
 * consistent. Best-effort activity log: never throws.
 *
 * Caller is responsible for updating Order.discountCents and adjusting
 * Order.totalCents — this function only writes the redemption ledger
 * + bumps the counter on the parent Discount record.
 */
export async function recordDiscountRedemption(args: {
  discountId: string;
  orderId: string;
  parentUserId: string | null;
  amountCents: number;
  /** Pre-fetched for the activity-log summary so callers don't have
   *  to re-query. Optional — falls back to "discount" if absent. */
  discountName?: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.discountRedemption.create({
      data: {
        discountId: args.discountId,
        orderId: args.orderId,
        parentUserId: args.parentUserId,
        amountCents: args.amountCents,
      },
    }),
    prisma.discount.update({
      where: { id: args.discountId },
      data: { currentRedemptions: { increment: 1 } },
    }),
  ]);

  // Best-effort timeline entry. We don't await failure cleanup because
  // logActivity already swallows errors internally.
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: { restaurantId: true, orderNumber: true },
  });
  if (order) {
    await logActivity({
      restaurantId: order.restaurantId,
      parentUserId: args.parentUserId,
      entityType: "ORDER",
      entityId: args.orderId,
      action: "DISCOUNT_APPLIED",
      summary: `${args.discountName ?? "Discount"} applied to order ${order.orderNumber} — saved ${formatCurrencyShort(args.amountCents)}`,
      metadata: {
        discountId: args.discountId,
        amountCents: args.amountCents,
      },
    });
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

interface EvalContext {
  cart: CartContext;
  priorOrderCount: number;
  perUserCounts: Map<string, number>;
}

/** Walk every eligibility rule, then compute the $ amount the discount
 *  would deduct. Returns 0 + a reason string on rejection — callers can
 *  show that reason to the operator on the admin discount preview but
 *  customers never see it (they just see no discount applied). */
function evaluate(d: Discount, ctx: EvalContext): DiscountEvaluation {
  const subtotal = ctx.cart.lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const lineCount = ctx.cart.lines.length;

  // Window — already filtered out in the query but double-check in
  // case the engine is called with a hand-built list.
  const now = new Date();
  if (d.startsAt && now < d.startsAt) {
    return reject(d, "Discount hasn't started yet.");
  }
  if (d.endsAt && now > d.endsAt) {
    return reject(d, "Discount has expired.");
  }

  // Total redemption cap.
  if (d.maxRedemptionsTotal !== null && d.currentRedemptions >= d.maxRedemptionsTotal) {
    return reject(d, "Discount has reached its total redemption limit.");
  }

  // Per-user cap.
  if (
    d.maxRedemptionsPerUser !== null &&
    ctx.cart.parentUserId &&
    (ctx.perUserCounts.get(d.id) ?? 0) >= d.maxRedemptionsPerUser
  ) {
    return reject(d, "You've already used this discount.");
  }

  // School scope.
  if (d.schoolIds.length > 0 && !d.schoolIds.includes(ctx.cart.schoolId)) {
    return reject(d, "Not valid for this location.");
  }

  // Weekday — ISO 1..7 (Mon=1, Sun=7). Slice 1 uses UTC weekday; slice 2
  // will wire in the school's timezone-aware version so a Friday in PT
  // doesn't get treated as Saturday in UTC.
  if (d.weekdays.length > 0) {
    const dow = isoWeekday(ctx.cart.deliveryDate);
    if (!d.weekdays.includes(dow)) {
      return reject(d, "Not valid on this day of the week.");
    }
  }

  // First-order only.
  if (d.firstOrderOnly && ctx.priorOrderCount > 0) {
    return reject(d, "Only valid on your first order.");
  }

  // Determine the "applicable subtotal" — what portion of the cart this
  // discount applies to. For ORDER scope = whole cart. For ITEMS scope =
  // only matching lines.
  const applicableLines = filterApplicableLines(d, ctx.cart.lines);
  const applicableSubtotal = applicableLines.reduce((s, l) => s + l.lineTotalCents, 0);

  if (d.scope === "ITEMS" && applicableLines.length === 0) {
    return reject(d, "No matching items in cart.");
  }

  // Minimum thresholds — compared against the full cart subtotal +
  // line count (operators set these in terms of the whole order, not
  // the matching subset).
  if (d.minOrderCents !== null && subtotal < d.minOrderCents) {
    return reject(d, `Order must be at least ${formatCurrencyShort(d.minOrderCents)}.`);
  }
  if (d.minItemCount !== null && lineCount < d.minItemCount) {
    return reject(d, `Order must contain at least ${d.minItemCount} item${d.minItemCount === 1 ? "" : "s"}.`);
  }

  // Compute the dollar amount.
  let amountCents = computeAmount(d, applicableSubtotal);

  // Never discount more than the applicable subtotal (can't go negative).
  if (amountCents > applicableSubtotal) amountCents = applicableSubtotal;
  // Round down to whole cents.
  amountCents = Math.floor(amountCents);

  if (amountCents <= 0) {
    return reject(d, "Discount amount is zero.");
  }

  return { discount: d, amountCents, reason: null };
}

function filterApplicableLines(d: Discount, lines: CartLine[]): CartLine[] {
  if (d.scope === "ORDER") return lines;
  // ITEMS scope: intersection of itemIds + categories. Both empty = all.
  // One populated = restrict to that set. Both populated = match either.
  const idSet = new Set(d.itemIds);
  const catSet = new Set(d.categories);
  if (idSet.size === 0 && catSet.size === 0) return lines;
  return lines.filter((line) => {
    if (idSet.size > 0 && idSet.has(line.menuItemId)) return true;
    if (catSet.size > 0 && line.category && catSet.has(line.category)) return true;
    return false;
  });
}

function computeAmount(d: Discount, applicableSubtotal: number): number {
  if (d.kind === "PERCENT") {
    return (applicableSubtotal * d.value) / 100;
  }
  // FIXED_AMOUNT — value is in cents.
  return d.value;
}

function reject(d: Discount, reason: string): DiscountEvaluation {
  return { discount: d, amountCents: 0, reason };
}

/** ISO weekday 1 (Mon) .. 7 (Sun). Native Date.getUTCDay() returns
 *  0 (Sun) .. 6 (Sat), so we convert. */
function isoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

function formatCurrencyShort(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Re-exports for convenience ──────────────────────────────────────────────

export type { Discount, DiscountKind, DiscountScope, DiscountTemplate };
