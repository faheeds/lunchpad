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

/**
 * Generates a full :root { } CSS block with all theme variables.
 */
export function themeCssBlock(opts: {
  primaryColor?:   string | null;
  accentColor?:    string | null;
  darkColor?:      string | null;
  heroTitleColor?: string | null;
  heroAccentColor?:string | null;
  bodyTextColor?:  string | null;
  displayFont?:    string | null;
  bodyFont?:       string | null;
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

  return [
    ":root {",
    `  --brand-h: ${h};`,
    `  --brand-s: ${s}%;`,
    `  --brand-hex: ${primary};`,
    `  --brand-rgb: ${hexToRgbString(primary)};`,
    `  --accent: ${accent};`,
    `  --accent-rgb: ${hexToRgbString(accent)};`,
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
