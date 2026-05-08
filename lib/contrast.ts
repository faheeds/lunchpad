/**
 * WCAG-aware contrast helpers used by:
 *   - The wizard branding step's live preview (flag + auto-fix bad combos)
 *   - Customer-facing components that need to render restaurant-themed text
 *     (header nav, success page, menu cards) with guaranteed legibility
 *
 * Builds on the lower-level luminance/HSL helpers in lib/color.ts.
 */

import {
  relativeLuminance,
  darkenForWhite,
  lightenForDark,
  hexToHsl,
} from "./color";

/** WCAG contrast ratio between two hex colors. 1.0 = same, 21.0 = black on white. */
export function contrastRatio(aHex: string, bHex: string): number {
  const la = relativeLuminance(aHex);
  const lb = relativeLuminance(bHex);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG AA (4.5:1) — minimum for normal body text. */
export function passesAA(textHex: string, bgHex: string): boolean {
  return contrastRatio(textHex, bgHex) >= 4.5;
}

/** WCAG AA Large (3:1) — large/bold headings only. */
export function passesAALarge(textHex: string, bgHex: string): boolean {
  return contrastRatio(textHex, bgHex) >= 3;
}

/** WCAG AAA (7:1) — best-practice for body text. */
export function passesAAA(textHex: string, bgHex: string): boolean {
  return contrastRatio(textHex, bgHex) >= 7;
}

/**
 * Returns "#000000" or "#ffffff" — whichever has better contrast against `bgHex`.
 * Use for text that sits on a restaurant-chosen background (e.g. a button bg
 * that's the operator's primaryColor).
 */
export function readableTextOn(bgHex: string): "#000000" | "#ffffff" {
  return relativeLuminance(bgHex) > 0.5 ? "#000000" : "#ffffff";
}

/**
 * Returns `textHex` if it already passes AA against `bgHex`. Otherwise
 * returns a same-hue shifted variant that does — darkened if the bg is
 * light, lightened if the bg is dark. Falls back to readableTextOn() if
 * even an HSL shift can't reach 4.5:1 (very unsaturated colors).
 */
export function ensureContrast(textHex: string, bgHex: string, minRatio = 4.5): string {
  if (contrastRatio(textHex, bgHex) >= minRatio) return textHex;

  const bgIsLight = relativeLuminance(bgHex) > 0.5;
  const shifted = bgIsLight
    ? darkenForWhite(textHex, minRatio)
    : lightenForDark(textHex, bgHex, minRatio);

  // Sanity: if the shift still doesn't pass (e.g. bg is mid-grey), fall back
  // to pure black or white.
  if (contrastRatio(shifted, bgHex) >= minRatio) return shifted;
  return readableTextOn(bgHex);
}

/**
 * Severity rating used by the wizard's branding step to flag combos.
 * "ok" = passes AA. "warn" = passes AA Large only (acceptable for big
 * display text). "fail" = falls below AA Large.
 */
export type ContrastSeverity = "ok" | "warn" | "fail";

export function rateContrast(textHex: string, bgHex: string): {
  ratio: number;
  severity: ContrastSeverity;
  suggestion: string | null;
} {
  const ratio = contrastRatio(textHex, bgHex);
  if (ratio >= 4.5) return { ratio, severity: "ok", suggestion: null };
  const fixed = ensureContrast(textHex, bgHex);
  if (ratio >= 3) {
    return { ratio, severity: "warn", suggestion: fixed };
  }
  return { ratio, severity: "fail", suggestion: fixed };
}

/**
 * Convenience: given a hex, returns a slightly darker version of itself
 * for use as a hover/pressed state. Same hue/sat, lower lightness.
 */
export function darkerVariant(hex: string, byPercent = 8): string {
  const { h, s, l } = hexToHsl(hex);
  const newL = Math.max(0, l - byPercent);
  // Reuse hslToHex via darkenForWhite at very high contrast — overkill,
  // so just inline the same conversion.
  const sat = s / 100;
  const lt = newL / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lt, 1 - lt);
  const f = (n: number) =>
    Math.round(255 * (lt - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
