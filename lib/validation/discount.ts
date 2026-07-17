/**
 * Validation for discount create / update from the admin builder.
 *
 * The builder posts a flat JSON payload of every editable field. Some
 * fields only make sense for certain templates (e.g. `code` only on
 * promo-code template), but the underlying DB shape is unified — the
 * builder UI gates which pills are visible, the schema accepts the
 * union.
 *
 * Two key normalizations:
 *  - `code` is upper-cased and whitespace-stripped so duplicate checks
 *    are case-insensitive ("welcome10" and "WELCOME10" collide).
 *  - Currency amounts arrive as dollars in the form for readability,
 *    we convert to integer cents server-side.
 */

import { z } from "zod";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Trimmed string → undefined when empty. Useful for optional text fields
 *  that the form posts as "" rather than omitting. */
const optionalTrimmed = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}, z.string().optional());

/** Comma OR newline separated list → deduped string array.
 *  Same pattern menuItemSchema uses for dietaryTags / requiredChoices,
 *  so operators get consistent input behavior across the admin. */
const csvList = z.preprocess((v) => {
  if (typeof v !== "string") return Array.isArray(v) ? v : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of v.split(/[\n,]+/)) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}, z.array(z.string()));

/** "10.50" (dollars from a form input) → 1050 (integer cents). */
const dollarsToCents = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}, z.number().int().nonnegative().optional());

const intOrUndefined = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}, z.number().int().optional());

const isoDateOrUndefined = z.preprocess((v) => {
  if (!v || typeof v !== "string") return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}, z.date().optional());

// ── Main schema ────────────────────────────────────────────────────────────

export const discountInputSchema = z.object({
  templateKind: z.enum([
    "WELCOME", "PROMO_CODE", "SIBLING", "DAY_OF_WEEK",
    "VOLUME", "ITEM_DISCOUNT", "BOGO", "BUNDLE", "CUSTOM",
  ]),

  // Identity
  name: z.string().min(2, "Name is required.").max(80),
  description: optionalTrimmed,

  // Code — required for PROMO_CODE template, null for all others. The
  // builder enforces this via the UI; we double-check server-side.
  code: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().min(2).max(40).optional(),
  ),

  // What it does
  kind: z.enum(["PERCENT", "FIXED_AMOUNT"]),
  // Dollar value for FIXED_AMOUNT arrives as a number-of-cents string.
  // Percent arrives as a 0-100 integer. We accept both shapes via the
  // same field by treating it as a positive int post-coercion.
  value: z.coerce.number().int().positive("Pick a discount amount above zero."),

  // Scope
  scope: z.enum(["ORDER", "ITEMS"]).default("ORDER"),
  itemIds: z.array(z.string()).default([]),
  categories: csvList.default([]),

  // Eligibility
  minOrderCents: dollarsToCents,
  minItemCount: intOrUndefined,
  firstOrderOnly: z.coerce.boolean().default(false),
  schoolIds: z.array(z.string()).default([]),
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).default([]),

  // Window
  startsAt: isoDateOrUndefined,
  endsAt: isoDateOrUndefined,

  // Limits
  maxRedemptionsTotal: intOrUndefined,
  maxRedemptionsPerUser: intOrUndefined,

  // Stacking
  allowStackingWithCode: z.coerce.boolean().default(false),

  // BOGO (slice 3 — accepted in schema for forward-compat, not yet
  // surfaced in the builder UI)
  bogoBuyItemIds: z.array(z.string()).default([]),
  bogoGetItemIds: z.array(z.string()).default([]),

  // Status — drafts are inactive, activations set true
  isActive: z.coerce.boolean().default(true),
})
.superRefine((data, ctx) => {
  // Cross-field validation. Easier in superRefine than in nested
  // pipelines because we want each error to point at the right field.

  // Percent must be 1..100, fixed amount must be > 0 cents.
  if (data.kind === "PERCENT" && (data.value < 1 || data.value > 100)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Percent discounts must be between 1 and 100.",
    });
  }

  // PROMO_CODE template requires a code.
  if (data.templateKind === "PROMO_CODE" && !data.code) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["code"],
      message: "Promo codes need a code (e.g. WELCOME10).",
    });
  }

  // SIBLING discount needs minItemCount ≥ 2.
  if (data.templateKind === "SIBLING" && (data.minItemCount ?? 0) < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minItemCount"],
      message: "Sibling discounts must require at least 2 items.",
    });
  }

  // VOLUME discount needs minOrderCents > 0.
  if (data.templateKind === "VOLUME" && (data.minOrderCents ?? 0) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minOrderCents"],
      message: "Spend & save discounts need a minimum order amount.",
    });
  }

  // DAY_OF_WEEK needs at least one weekday selected.
  if (data.templateKind === "DAY_OF_WEEK" && data.weekdays.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["weekdays"],
      message: "Pick at least one weekday.",
    });
  }

  // Window sanity: end after start.
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "End date must be after the start date.",
    });
  }
});

export type DiscountInput = z.infer<typeof discountInputSchema>;
