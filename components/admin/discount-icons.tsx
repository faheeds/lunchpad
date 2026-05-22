/**
 * Discount template icons + tinted color palettes.
 *
 * Replaces the emoji placeholders with hand-drawn line icons in the
 * Lucide style — 24×24 viewBox, 1.75 stroke, rounded line joins.
 * Each template gets a colored circle background using a curated palette
 * so the gallery reads as distinct cards without veering into rainbow
 * chaos. Same icon + color is reused on the Discount Center list rows
 * and the builder header so the surface stays consistent.
 */

import type { ReactNode } from "react";

// ─── Icon palette ────────────────────────────────────────────────────────────

interface IconBaseProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function makeIcon(children: ReactNode) {
  return function Icon({ size = 22, className, strokeWidth = 1.75 }: IconBaseProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

// Welcome offer — gift box with a bow
export const GiftIcon = makeIcon(
  <>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8" />
    <path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" />
  </>
);

// Promo code — coupon-style price tag
export const TagIcon = makeIcon(
  <>
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <circle cx="7" cy="7" r="1" />
  </>
);

// Sibling — two people side by side
export const UsersIcon = makeIcon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>
);

// Day-of-week — calendar with one date highlighted
export const CalendarIcon = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <rect x="11" y="13" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
  </>
);

// BOGO — two overlapping squares (buy one, get one)
export const LayersIcon = makeIcon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
);

// Bundle — package box with strap lines
export const PackageIcon = makeIcon(
  <>
    <path d="M16.5 9.4 7.5 4.21" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </>
);

// Volume / spend & save — stacked coins
export const CoinsIcon = makeIcon(
  <>
    <ellipse cx="12" cy="6" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 6v12c0 1.66 4 3 9 3s9-1.34 9-3V6" />
  </>
);

// Item discount — stacked tags
export const TagsIcon = makeIcon(
  <>
    <path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z" />
    <circle cx="5.5" cy="8.5" r="0.75" fill="currentColor" stroke="none" />
    <path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19" />
  </>
);

// Loyalty — star (reserved for slice 4)
export const StarIcon = makeIcon(
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
);

// Custom — sliders / adjustable
export const SlidersIcon = makeIcon(
  <>
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </>
);

// ─── Per-template palette ───────────────────────────────────────────────────
// Each entry: tinted background + saturated foreground. Backgrounds are
// at the 50 step (very pale), foregrounds at 600-700 (rich but not loud).
// The palette is intentionally diverse but tonally coordinated — every
// fg color hits the same lightness band so the gallery reads as a unified
// set instead of a confetti page.

export type DiscountIconName =
  | "WELCOME"
  | "PROMO_CODE"
  | "SIBLING"
  | "DAY_OF_WEEK"
  | "BOGO"
  | "BUNDLE"
  | "VOLUME"
  | "ITEM_DISCOUNT"
  | "LOYALTY"
  | "CUSTOM";

export const TEMPLATE_PALETTE: Record<DiscountIconName, { bg: string; fg: string }> = {
  WELCOME:       { bg: "#fef2f2", fg: "#2C4031" }, // editorial green
  PROMO_CODE:    { bg: "#faf5ff", fg: "#7c3aed" }, // violet
  SIBLING:       { bg: "#fffbeb", fg: "#d97706" }, // amber
  DAY_OF_WEEK:   { bg: "#eff6ff", fg: "#2563eb" }, // blue
  BOGO:          { bg: "#f0fdfa", fg: "#0d9488" }, // teal
  BUNDLE:        { bg: "#ecfdf5", fg: "#059669" }, // emerald
  VOLUME:        { bg: "#f7fee7", fg: "#65a30d" }, // lime
  ITEM_DISCOUNT: { bg: "#eef2ff", fg: "#4f46e5" }, // indigo
  LOYALTY:       { bg: "#fefce8", fg: "#ca8a04" }, // gold
  CUSTOM:        { bg: "#f8fafc", fg: "#475569" }, // slate
};

const ICON_BY_KIND: Record<DiscountIconName, (props: IconBaseProps) => ReactNode> = {
  WELCOME:       GiftIcon,
  PROMO_CODE:    TagIcon,
  SIBLING:       UsersIcon,
  DAY_OF_WEEK:   CalendarIcon,
  BOGO:          LayersIcon,
  BUNDLE:        PackageIcon,
  VOLUME:        CoinsIcon,
  ITEM_DISCOUNT: TagsIcon,
  LOYALTY:       StarIcon,
  CUSTOM:        SlidersIcon,
};

// ─── Convenience wrapper ────────────────────────────────────────────────────
// Renders an icon inside its colored circle. Two sizes used across the
// app: "lg" (~44px) for gallery cards, "sm" (~28px) for list rows.

export function DiscountTemplateBadge({
  kind,
  size = "lg",
}: {
  kind: DiscountIconName;
  size?: "lg" | "sm" | "md";
}) {
  const palette = TEMPLATE_PALETTE[kind] ?? TEMPLATE_PALETTE.CUSTOM;
  const Icon = ICON_BY_KIND[kind] ?? ICON_BY_KIND.CUSTOM;
  const px = size === "lg" ? 44 : size === "md" ? 36 : 28;
  const iconPx = size === "lg" ? 22 : size === "md" ? 18 : 14;
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl flex-shrink-0"
      style={{ width: px, height: px, background: palette.bg, color: palette.fg }}
    >
      <Icon size={iconPx} strokeWidth={size === "sm" ? 2 : 1.75} />
    </span>
  );
}

// Plain icon-only export — when the caller wants the icon without a
// background tile (e.g. inline in a sentence).
export function DiscountTemplateIcon({
  kind,
  size = 18,
  className,
}: {
  kind: DiscountIconName;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_BY_KIND[kind] ?? ICON_BY_KIND.CUSTOM;
  return <Icon size={size} className={className} />;
}
