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

/**
 * Converts a hex color to its R,G,B components as a comma-separated string.
 * e.g. "#c41230" → "196,18,48"  (for use in rgba())
 */
export function hexToRgbString(hex: string): string {
  const clean = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

/**
 * Generates a <style> tag content string injecting all theme CSS variables.
 * Covers: brand (HSL + hex + rgb), accent, dark-bg.
 */
export function themeCssBlock(opts: {
  primaryColor?: string | null;
  accentColor?: string | null;
  darkColor?: string | null;
}): string {
  const primary = opts.primaryColor ?? "#c41230";
  const accent  = opts.accentColor  ?? "#f59e0b";
  const dark    = opts.darkColor    ?? "#1c0505";

  const { h, s } = hexToHsl(primary);
  const brandRgb  = hexToRgbString(primary);
  const accentRgb = hexToRgbString(accent);
  const darkRgb   = hexToRgbString(dark);

  return [
    ":root {",
    `  --brand-h: ${h};`,
    `  --brand-s: ${s}%;`,
    `  --brand-hex: ${primary};`,
    `  --brand-rgb: ${brandRgb};`,
    `  --accent: ${accent};`,
    `  --accent-rgb: ${accentRgb};`,
    `  --dark-bg: ${dark};`,
    `  --dark-rgb: ${darkRgb};`,
    "}",
  ].join("\n");
}
