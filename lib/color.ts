/**
 * Converts a hex color (#rrggbb) to HSL components.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hexToRgbString(hex: string): string {
  const clean = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ].join(",");
}

/** Convert HSL → hex string. h:0-360, s:0-100, l:0-100 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** WCAG relative luminance of a hex color */
function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLinear(parseInt(clean.slice(0, 2), 16)) +
    0.7152 * toLinear(parseInt(clean.slice(2, 4), 16)) +
    0.0722 * toLinear(parseInt(clean.slice(4, 6), 16))
  );
}

/**
 * Darken `hex` (same hue/sat) until it achieves `minContrast` against white.
 * Used for brand-on-white: ensures icons and labels on cards are always readable.
 */
function darkenForWhite(hex: string, minContrast = 4.5): string {
  const { h, s, l: startL } = hexToHsl(hex);
  let l = startL;
  while (l > 4) {
    const candidate = hslToHex(h, s, l);
    const contrast = 1.05 / (relativeLuminance(candidate) + 0.05);
    if (contrast >= minContrast) return candidate;
    l -= 2;
  }
  return hslToHex(h, s, 4);
}

/**
 * Lighten `hex` (same hue/sat) until it achieves `minContrast` against `darkHex`.
 * Used for accent-on-dark: ensures accent text/icons on the header are always readable.
 */
function lightenForDark(hex: string, darkHex: string, minContrast = 3.5): string {
  const darkLum = relativeLuminance(darkHex);
  const { h, s, l: startL } = hexToHsl(hex);
  let l = startL;
  while (l < 96) {
    const candidate = hslToHex(h, s, l);
    const lum = relativeLuminance(candidate);
    const contrast = (lum + 0.05) / (darkLum + 0.05);
    if (contrast >= minContrast) return candidate;
    l += 2;
  }
  return hslToHex(h, s, 96);
}

/**
 * Generates a full :root { } CSS block with all theme variables.
 * Auto-computes contrast-safe variants so colors always look right
 * regardless of which theme the restaurant picks.
 */
export function themeCssBlock(opts: {
  primaryColor?:    string | null;
  accentColor?:     string | null;
  darkColor?:       string | null;
  heroTitleColor?:  string | null;
  heroAccentColor?: string | null;
  bodyTextColor?:   string | null;
  displayFont?:     string | null;
  bodyFont?:        string | null;
}): string {
  const primary       = opts.primaryColor    ?? "#c41230";
  const accent        = opts.accentColor     ?? "#f59e0b";
  const dark          = opts.darkColor       ?? "#1c0505";
  const heroTitle     = opts.heroTitleColor  ?? "#ffffff";
  const heroAccent    = opts.heroAccentColor ?? "#fbbf24";
  const bodyText      = opts.bodyTextColor   ?? "#1c0505";
  const displayFamily = opts.displayFont     ?? "Oswald";
  const bodyFamily    = opts.bodyFont        ?? "Inter";

  const { h, s } = hexToHsl(primary);

  // Contrast-safe variants computed automatically
  const brandOnWhite  = darkenForWhite(primary);          // always readable on white cards
  const accentOnDark  = lightenForDark(accent, dark);     // always readable on dark header
  const primaryOnDark = lightenForDark(primary, dark);    // brand color readable on dark bg

  return [
    ":root {",
    `  --brand-h: ${h};`,
    `  --brand-s: ${s}%;`,
    `  --brand-hex: ${primary};`,
    `  --brand-rgb: ${hexToRgbString(primary)};`,
    `  --brand-on-white: ${brandOnWhite};`,
    `  --brand-on-white-rgb: ${hexToRgbString(brandOnWhite)};`,
    `  --brand-on-dark: ${primaryOnDark};`,
    `  --brand-on-dark-rgb: ${hexToRgbString(primaryOnDark)};`,
    `  --accent: ${accent};`,
    `  --accent-rgb: ${hexToRgbString(accent)};`,
    `  --accent-on-dark: ${accentOnDark};`,
    `  --dark-bg: ${dark};`,
    `  --dark-rgb: ${hexToRgbString(dark)};`,
    `  --hero-title: ${heroTitle};`,
    `  --hero-accent: ${heroAccent};`,
    `  --body-text: ${bodyText};`,
    `  --font-display: '${displayFamily}', sans-serif;`,
    `  --font-body: '${bodyFamily}', sans-serif;`,
    "}",
  ].join("\n");
}
