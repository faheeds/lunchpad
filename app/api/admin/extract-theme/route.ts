import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";

// ─── Font registries (must mirror lib/fonts.ts) ──────────────────────────────

const DISPLAY_IDS = [
  "Oswald","Bebas Neue","Anton","Barlow Condensed","Fjalla One",
  "Roboto Condensed","Montserrat","Raleway","Playfair Display",
  "Urbanist","Exo 2","Nunito","DM Sans","Kanit","Poppins",
];
const BODY_IDS = [
  "Inter","Open Sans","Roboto","Lato","Poppins","Nunito Sans",
  "DM Sans","Work Sans","Mulish","Source Sans 3","Karla","Noto Sans",
];

// Fonts that strongly indicate a display/heading role (condensed, decorative, heavy)
const DISPLAY_SIGNALS = /condensed|narrow|bebas|fjalla|anton|oswald|impact|black|heavy|ultra|display|kanit|barlow/i;

// ─── CSS / HTML helpers ───────────────────────────────────────────────────────

function extractHexColors(text: string): string[] {
  const found = new Set<string>();
  const pattern = /#([0-9a-fA-F]{6})\b/g;
  let m;
  while ((m = pattern.exec(text)) !== null) found.add("#" + m[1].toLowerCase());
  // Also capture shorthand #rgb → expand
  const short = /#([0-9a-fA-F]{3})\b/g;
  while ((m = short.exec(text)) !== null) {
    const [r, g, b] = m[1].split("");
    found.add("#" + r+r+g+g+b+b);
  }
  return [...found];
}

function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const toLinear = (v: number) => v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4;
  return 0.2126*toLinear(parseInt(c.slice(0,2),16)/255)
       + 0.7152*toLinear(parseInt(c.slice(2,4),16)/255)
       + 0.0722*toLinear(parseInt(c.slice(4,6),16)/255);
}

function contrastVsWhite(hex: string): number { return 1.05 / (hexLuminance(hex) + 0.05); }
function contrastVsBlack(hex: string): number { return (hexLuminance(hex) + 0.05) / 0.05; }

function isTooLight(hex: string): boolean {
  const c = hex.replace("#","");
  const avg = (parseInt(c.slice(0,2),16)+parseInt(c.slice(2,4),16)+parseInt(c.slice(4,6),16))/3;
  return avg > 230;
}
function isTooDark(hex: string): boolean {
  const c = hex.replace("#","");
  const avg = (parseInt(c.slice(0,2),16)+parseInt(c.slice(2,4),16)+parseInt(c.slice(4,6),16))/3;
  return avg < 20;
}

function hexSaturation(hex: string): number {
  const c = hex.replace("#","");
  const r=parseInt(c.slice(0,2),16)/255, g=parseInt(c.slice(2,4),16)/255, b=parseInt(c.slice(4,6),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
  return max===min ? 0 : (max-min)/(l>0.5?2-max-min:max+min);
}

// Extract CSS custom properties from :root blocks
function extractCssVars(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const rootBlock = /:root\s*\{([^}]+)\}/g;
  let m;
  while ((m = rootBlock.exec(css)) !== null) {
    const varPat = /--([a-z0-9_-]+)\s*:\s*([^;}\n]+)/gi;
    let v;
    while ((v = varPat.exec(m[1])) !== null) {
      const val = v[2].trim();
      if (val.startsWith("#") || val.startsWith("rgb") || val.startsWith("hsl"))
        vars[v[1].toLowerCase()] = val;
    }
  }
  return vars;
}

// Extract Google Fonts families from HTML and CSS
interface FontEntry { name: string; weights: number[]; url: string }
function extractGoogleFonts(html: string, css: string): FontEntry[] {
  const map = new Map<string, FontEntry>();
  const combined = html + "\n" + css;
  const urlPat = /fonts\.googleapis\.com\/css2?\?([^"'\s>)]+)/g;
  let m;
  while ((m = urlPat.exec(combined)) !== null) {
    const raw = m[1].replace(/&amp;/g, "&");
    const params = new URLSearchParams(raw);
    const families: string[] = [];
    params.forEach((val, key) => {
      if (key === "family") families.push(val);
    });
    // also handle older format: family=Font1|Font2
    const famParam = params.get("family") ?? "";
    famParam.split("|").forEach(fam => { if (!families.includes(fam)) families.push(fam); });
    for (const fam of families.filter(Boolean)) {
      const colonIdx = fam.indexOf(":");
      const name = (colonIdx > -1 ? fam.slice(0, colonIdx) : fam)
        .replace(/\+/g, " ").trim();
      if (!name) continue;
      const weightStr = colonIdx > -1 ? fam.slice(colonIdx + 1) : "";
      const weights = (weightStr.match(/\d{3}/g) || ["400"]).map(Number);
      const ex = map.get(name);
      if (ex) { ex.weights = [...new Set([...ex.weights, ...weights])]; }
      else {
        map.set(name, {
          name,
          weights,
          url: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name.replace(/ /g,"+"))}:wght@${[...new Set(weights)].sort().join(";")}&display=swap`,
        });
      }
    }
  }
  return [...map.values()];
}

// Match a font name to our registered display/body lists (fuzzy)
function matchDisplayFont(name: string): string | null {
  const lower = name.toLowerCase();
  for (const id of DISPLAY_IDS) if (id.toLowerCase() === lower) return id;
  for (const id of DISPLAY_IDS) if (lower.includes(id.toLowerCase()) || id.toLowerCase().includes(lower)) return id;
  return null;
}
function matchBodyFont(name: string): string | null {
  const lower = name.toLowerCase();
  for (const id of BODY_IDS) if (id.toLowerCase() === lower) return id;
  for (const id of BODY_IDS) if (lower.includes(id.toLowerCase()) || id.toLowerCase().includes(lower)) return id;
  return null;
}

// Extract value of a CSS property from a block of CSS text for given selectors
function extractPropFromSelectors(css: string, selectors: string[], prop: string): string | null {
  for (const sel of selectors) {
    // Match rule blocks for this selector
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pat = new RegExp(escaped + "\\s*\\{([^}]+)\\}", "gi");
    let m;
    while ((m = pat.exec(css)) !== null) {
      const block = m[1];
      const propPat = new RegExp(prop + "\\s*:\\s*([^;!\\n]+)", "i");
      const vMatch = block.match(propPat);
      if (vMatch) {
        const val = vMatch[1].trim();
        if (val.startsWith("#") || val.startsWith("rgb")) return val;
      }
    }
  }
  return null;
}

// Resolve a CSS color value that might be a var() reference
function resolveCssColor(val: string, vars: Record<string, string>): string | null {
  if (!val) return null;
  if (val.startsWith("#")) return val;
  if (val.startsWith("rgb")) {
    // Extract first hex from rgb string
    const m = val.match(/#[0-9a-fA-F]{6}/);
    return m ? m[0] : null;
  }
  if (val.startsWith("var(")) {
    const varName = val.match(/var\(--([^),\s]+)/)?.[1]?.toLowerCase();
    if (varName && vars[varName]) return resolveCssColor(vars[varName], vars);
  }
  return null;
}

// Find first valid hex from a string (could be value of CSS prop)
function firstHex(val: string | null): string | null {
  if (!val) return null;
  const m = val.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : null;
}

// ─── Main fetch helpers ───────────────────────────────────────────────────────

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

async function safeFetch(url: string, maxBytes = 300_000): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder().decode(buf.slice(0, maxBytes));
  return text;
}

function extractStylesheetUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const pat = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = pat.exec(html)) !== null) {
    const href = m[1];
    if (href.includes("fonts.googleapis")) continue; // skip Google Fonts
    try {
      urls.push(new URL(href, baseUrl).href);
    } catch { /* skip invalid */ }
  }
  // Also check href-first form
  const pat2 = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["'][^>]*>/gi;
  while ((m = pat2.exec(html)) !== null) {
    const href = m[1];
    if (href.includes("fonts.googleapis")) continue;
    try {
      const full = new URL(href, baseUrl).href;
      if (!urls.includes(full)) urls.push(full);
    } catch { /* skip */ }
  }
  return urls.slice(0, 4); // fetch at most 4 stylesheets
}

function extractInlineStyles(html: string): string {
  const blocks: string[] = [];
  const pat = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = pat.exec(html)) !== null) blocks.push(m[1]);
  return blocks.join("\n");
}

// ─── API handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await assertAdminApiRequest("OWNER");
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

    // 1. Fetch the page HTML
    let html: string;
    try {
      html = await safeFetch(url);
    } catch (e) {
      throw new Error("Could not reach that URL — the site may block automated requests.");
    }

    const baseUrl = new URL(url).origin;

    // 2. Fetch external stylesheets
    const sheetUrls = extractStylesheetUrls(html, baseUrl);
    const sheetTexts = await Promise.all(
      sheetUrls.map(u => safeFetch(u, 200_000).catch(() => ""))
    );
    const externalCss = sheetTexts.join("\n");

    // 3. Extract inline <style> blocks
    const inlineCss = extractInlineStyles(html);

    // 4. All CSS combined
    const allCss = inlineCss + "\n" + externalCss;

    // 5. Extract CSS custom properties
    const cssVars = extractCssVars(allCss);

    // 6. Extract Google Fonts
    const googleFonts = extractGoogleFonts(html, allCss);

    // ── Font assignment ──────────────────────────────────────────────────────
    let displayFont: string | null = null;
    let bodyFont:    string | null = null;
    const fontsFound: string[] = googleFonts.map(f => f.name);

    // Sort: fonts with display signals first, then by max weight (heavier = likely display)
    const sorted = [...googleFonts].sort((a, b) => {
      const aDisp = DISPLAY_SIGNALS.test(a.name) ? 1 : 0;
      const bDisp = DISPLAY_SIGNALS.test(b.name) ? 1 : 0;
      if (aDisp !== bDisp) return bDisp - aDisp;
      return Math.max(...b.weights) - Math.max(...a.weights);
    });

    for (const font of sorted) {
      if (!displayFont) {
        const m = matchDisplayFont(font.name);
        if (m) { displayFont = m; continue; }
      }
      if (!bodyFont) {
        const m = matchBodyFont(font.name);
        if (m) { bodyFont = m; continue; }
      }
    }

    // If only one font found, decide based on signals
    if (displayFont && !bodyFont && sorted.length === 1) bodyFont = null;
    if (!displayFont && bodyFont && sorted.length === 1) {
      // If it's a display signal font, promote it
      if (DISPLAY_SIGNALS.test(sorted[0].name)) { displayFont = bodyFont; bodyFont = null; }
    }

    // ── Color assignment ─────────────────────────────────────────────────────

    // First, try semantic CSS custom properties
    const CSS_VAR_CANDIDATES: Record<string, string[]> = {
      dark:    ["color-dark","background-dark","dark-bg","header-bg","nav-bg","primary-dark","color-black","bg-dark","black"],
      primary: ["color-primary","primary","brand","brand-color","color-brand","accent-primary","main-color","cta-color","button-bg","btn-bg"],
      accent:  ["color-accent","accent","secondary","color-secondary","highlight","color-highlight"],
      bodyText:["color-text","text-color","body-text","text","foreground","color-foreground","color-body"],
      heroText:["hero-text","hero-title","heading-color","color-heading","title-color"],
    };

    function fromCssVars(keys: string[]): string | null {
      for (const k of keys) {
        const val = cssVars[k] ?? cssVars[k.replace(/-/g,"_")] ?? null;
        if (val) { const h = firstHex(val); if (h && !isTooLight(h)) return h; }
      }
      return null;
    }

    // Semantic selectors
    const NAV_SELECTORS    = ["nav","header",".navbar",".nav",".header",".site-header","[class*='nav']","[class*='header']"];
    const BUTTON_SELECTORS = ["button",".btn",".button",".cta","a.btn","[class*='btn']","[class*='button']","[class*='cta']"];
    const HEADING_SELECTORS= ["h1","h2",".hero h1","[class*='hero'] h1","[class*='title']","[class*='heading']"];
    const BODY_SELECTORS   = ["body","p",".body-text","[class*='body-text']","main p"];

    // Extract semantic colors from CSS rules
    const navBg     = firstHex(extractPropFromSelectors(allCss, NAV_SELECTORS, "background(?:-color)?") ?? "");
    const btnBg     = firstHex(extractPropFromSelectors(allCss, BUTTON_SELECTORS, "background(?:-color)?") ?? "");
    const headingColor = firstHex(extractPropFromSelectors(allCss, HEADING_SELECTORS, "color") ?? "");
    const bodyColor  = firstHex(extractPropFromSelectors(allCss, BODY_SELECTORS, "color") ?? "");

    // meta theme-color
    const themeColorMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)
                          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
    const metaThemeColor = themeColorMatch ? firstHex(themeColorMatch[1]) : null;

    // All hex colors from the page, filtered
    const allPageColors = extractHexColors(html + allCss)
      .filter(c => !isTooLight(c) && !isTooDark(c));

    // Sort by saturation desc (most saturated = likely brand colors)
    const bySaturation = [...allPageColors].sort((a,b) => hexSaturation(b) - hexSaturation(a));

    // ── Assign dark (header/bg) ──────────────────────────────────────────────
    let darkColor = fromCssVars(CSS_VAR_CANDIDATES.dark)
      ?? navBg
      ?? allPageColors.find(c => hexLuminance(c) < 0.08); // very dark

    // ── Assign primary (brand/CTA) ───────────────────────────────────────────
    let primaryColor = fromCssVars(CSS_VAR_CANDIDATES.primary)
      ?? metaThemeColor
      ?? btnBg
      ?? bySaturation.find(c => c !== darkColor && hexSaturation(c) > 0.3);

    // ── Assign accent (secondary) ────────────────────────────────────────────
    let accentColor = fromCssVars(CSS_VAR_CANDIDATES.accent)
      ?? bySaturation.find(c => c !== darkColor && c !== primaryColor && hexSaturation(c) > 0.25);

    // ── Assign body text ─────────────────────────────────────────────────────
    let bodyTextColor = fromCssVars(CSS_VAR_CANDIDATES.bodyText)
      ?? bodyColor
      ?? "#1c0505";
    if (bodyTextColor && isTooLight(bodyTextColor)) bodyTextColor = "#1c0505";

    // ── Assign hero title color ───────────────────────────────────────────────
    let heroTitleColor = fromCssVars(CSS_VAR_CANDIDATES.heroText)
      ?? headingColor
      ?? "#ffffff";
    // Hero text should be light (it sits on dark hero)
    if (heroTitleColor && hexLuminance(heroTitleColor) < 0.08) heroTitleColor = "#ffffff";

    // ── Hero accent (subheading) ─────────────────────────────────────────────
    const heroAccentColor = accentColor ?? primaryColor ?? "#fbbf24";

    // ── Build summary ─────────────────────────────────────────────────────────
    const summaryParts: string[] = [];
    if (darkColor)    summaryParts.push(`Dark bg: ${darkColor}`);
    if (primaryColor) summaryParts.push(`Brand: ${primaryColor}`);
    if (accentColor)  summaryParts.push(`Accent: ${accentColor}`);
    if (displayFont)  summaryParts.push(`Display font: ${displayFont}`);
    if (bodyFont)     summaryParts.push(`Body font: ${bodyFont}`);
    if (!displayFont && fontsFound.length) summaryParts.push(`Fonts found (no match): ${fontsFound.slice(0,3).join(", ")}`);

    return NextResponse.json({
      darkColor:       darkColor       ?? null,
      primaryColor:    primaryColor    ?? null,
      accentColor:     accentColor     ?? null,
      heroTitleColor:  heroTitleColor  ?? "#ffffff",
      heroAccentColor: heroAccentColor ?? null,
      bodyTextColor:   bodyTextColor   ?? null,
      displayFont:     displayFont     ?? null,
      bodyFont:        bodyFont        ?? null,
      fontsFound,
      colorsFound:     bySaturation.slice(0, 8),
      summary:         summaryParts.join(" · ") || "Extracted — review and save",
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
