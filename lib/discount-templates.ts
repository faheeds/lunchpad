/**
 * Discount template registry — single source of truth for the gallery
 * page, the builder pre-fills, and which fields each template surfaces
 * in its UI.
 *
 * A "template" is an operator-facing preset that maps to the unified
 * Discount model with sensible defaults. The data model is identical
 * across templates; templates only differ in what pills the builder
 * renders and how it pre-fills them.
 *
 * Slice 2 ships builders for WELCOME, PROMO_CODE, and SIBLING. The
 * others appear in the gallery but route to a "Coming soon" interstitial
 * — we kept the gallery complete so operators can see what's planned
 * even if they can't use it yet.
 */

export type TemplateSlug =
  | "welcome"
  | "promo-code"
  | "sibling"
  | "day-of-week"
  | "volume"
  | "item-discount"
  | "bogo"
  | "bundle"
  | "custom";

export interface TemplateMeta {
  slug: TemplateSlug;
  kind:
    | "WELCOME"
    | "PROMO_CODE"
    | "SIBLING"
    | "DAY_OF_WEEK"
    | "VOLUME"
    | "ITEM_DISCOUNT"
    | "BOGO"
    | "BUNDLE"
    | "CUSTOM";
  title: string;
  /** One-line description shown on the gallery card. */
  description: string;
  /** Example chip below the description, e.g. "10% off · first order". */
  example: string;
  /** Slice 2 indicator — falsy templates open a "Coming soon" page. */
  available: boolean;
  /** Pre-fill values for the builder. Used by the new route to seed
   *  the initial state. */
  defaults: TemplateDefaults;
}

export interface TemplateDefaults {
  name: string;
  kind: "PERCENT" | "FIXED_AMOUNT";
  value: number;
  scope: "ORDER" | "ITEMS";
  firstOrderOnly: boolean;
  minItemCount: number | null;
  minOrderCents: number | null;
  weekdays: number[];
  maxRedemptionsPerUser: number | null;
}

const COMMON_DEFAULTS: TemplateDefaults = {
  name: "",
  kind: "PERCENT",
  value: 10,
  scope: "ORDER",
  firstOrderOnly: false,
  minItemCount: null,
  minOrderCents: null,
  weekdays: [],
  maxRedemptionsPerUser: null,
};

export const TEMPLATES: TemplateMeta[] = [
  {
    slug: "welcome",
    kind: "WELCOME",
    title: "Welcome offer",
    description: "New families get a percent off their first order.",
    example: "10% off · first order only",
    available: true,
    defaults: {
      ...COMMON_DEFAULTS,
      name: "Welcome offer",
      kind: "PERCENT",
      value: 10,
      firstOrderOnly: true,
      maxRedemptionsPerUser: 1,
    },
  },
  {
    slug: "promo-code",
    kind: "PROMO_CODE",
    title: "Promo code",
    description: "Customer enters a code at checkout to unlock a discount.",
    example: "WELCOME20 · 20% off",
    available: true,
    defaults: {
      ...COMMON_DEFAULTS,
      name: "Promo code",
      kind: "PERCENT",
      value: 20,
      maxRedemptionsPerUser: 1,
    },
  },
  {
    slug: "sibling",
    kind: "SIBLING",
    title: "Sibling discount",
    description: "Order for multiple students, save on the whole order.",
    example: "$3 off · 2+ students",
    available: true,
    defaults: {
      ...COMMON_DEFAULTS,
      name: "Sibling discount",
      kind: "FIXED_AMOUNT",
      value: 300, // $3 in cents
      minItemCount: 2,
      maxRedemptionsPerUser: null, // unlimited — they get it every order with 2+ kids
    },
  },
  {
    slug: "day-of-week",
    kind: "DAY_OF_WEEK",
    title: "Day-of-week deal",
    description: "Special pricing on a specific weekday.",
    example: "Tacos · Tuesdays",
    available: true,
    defaults: { ...COMMON_DEFAULTS, weekdays: [2] },
  },
  {
    slug: "bogo",
    kind: "BOGO",
    title: "Buy one, get one",
    description: "Free or discounted item with another item.",
    example: "Burger + fries free",
    available: false,
    defaults: { ...COMMON_DEFAULTS },
  },
  {
    slug: "bundle",
    kind: "BUNDLE",
    title: "Bundle deal",
    description: "Pre-set combo at a flat price.",
    example: "Lunch combo: $9.99",
    available: false,
    defaults: { ...COMMON_DEFAULTS },
  },
  {
    slug: "volume",
    kind: "VOLUME",
    title: "Spend & save",
    description: "Order over a threshold, save on everything.",
    example: "$30 → 10% off",
    available: true,
    defaults: { ...COMMON_DEFAULTS, minOrderCents: 3000 },
  },
  {
    slug: "item-discount",
    kind: "ITEM_DISCOUNT",
    title: "Specific items",
    description: "Percent off one or more chosen items or categories.",
    example: "Salads · 15% off",
    available: false,
    defaults: { ...COMMON_DEFAULTS, scope: "ITEMS", value: 15 },
  },
  {
    slug: "custom",
    kind: "CUSTOM",
    title: "Custom",
    description: "Build from scratch with every option.",
    example: "All fields available",
    available: false,
    defaults: { ...COMMON_DEFAULTS },
  },
];

export function getTemplate(slug: string): TemplateMeta | null {
  return TEMPLATES.find((t) => t.slug === slug) ?? null;
}

export function templateForKind(kind: TemplateMeta["kind"]): TemplateMeta | null {
  return TEMPLATES.find((t) => t.kind === kind) ?? null;
}
