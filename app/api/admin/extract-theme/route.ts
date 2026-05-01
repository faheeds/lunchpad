import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";

function findColors(html: string): string[] {
  const hexPattern = /#([0-9a-fA-F]{6})\b/g;
  const found = new Set<string>();
  let m;
  while ((m = hexPattern.exec(html)) !== null) {
    found.add("#" + m[1].toLowerCase());
  }
  // Filter out pure white, near-white, and near-black
  return [...found].filter((c) => {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    const lum = (r + g + b) / 3;
    return lum > 20 && lum < 235;   // skip near-black and near-white
  });
}

function findGoogleFonts(html: string): string[] {
  const fonts: string[] = [];
  const linkPattern = /fonts\.googleapis\.com\/css[^"'\s]*family=([^&"'\s]+)/g;
  let m;
  while ((m = linkPattern.exec(html)) !== null) {
    const families = decodeURIComponent(m[1]).split("|");
    families.forEach((f) => {
      const name = f.split(":")[0].replace(/\+/g, " ").trim();
      if (name) fonts.push(name);
    });
  }
  return [...new Set(fonts)];
}

function findThemeColor(html: string): string | null {
  const m = html.match(/<meta[^>]+name=["\']theme-color["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i)
          || html.match(/<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']theme-color["\'][^>]*>/i);
  return m ? m[1].trim() : null;
}

function pickDark(colors: string[]): string {
  return colors.find((c) => {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return (r + g + b) / 3 < 80;
  }) ?? "#1c0505";
}

function pickVibrant(colors: string[], exclude: string): string {
  return colors.find((c) => {
    if (c === exclude) return false;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return (max - min) > 60;  // saturation proxy
  }) ?? "#c41230";
}

const DISPLAY_IDS = ["Oswald", "Bebas Neue", "Montserrat", "Playfair Display", "Raleway"];
const BODY_IDS    = ["Inter", "Poppins", "Open Sans", "Lato"];

export async function POST(req: NextRequest) {
  try {
    await assertAdminApiRequest("OWNER");
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
    } catch (fetchErr) {
      throw new Error("Could not reach that URL — the site may block automated requests, or the address is unreachable.");
    }
    if (!res.ok) throw new Error(`Site returned ${res.status} — try a different URL.`);
    const html = await res.text();

    const themeColor = findThemeColor(html);
    const allColors  = findColors(html);
    const fonts      = findGoogleFonts(html);

    const dark    = pickDark(allColors);
    const primary = themeColor ?? pickVibrant(allColors, dark);
    const accent  = pickVibrant(allColors.filter((c) => c !== primary), dark);

    const displayFont = fonts.find((f) => DISPLAY_IDS.some((id) => id.toLowerCase() === f.toLowerCase())) ?? null;
    const bodyFont    = fonts.find((f) => BODY_IDS.some((id) => id.toLowerCase() === f.toLowerCase())) ?? null;

    return NextResponse.json({
      darkColor:    dark,
      primaryColor: primary,
      accentColor:  accent,
      displayFont,
      bodyFont,
      fontsFound:   fonts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to extract theme";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
