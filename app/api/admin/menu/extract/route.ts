import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

export interface MenuItemExtracted {
  name: string;
  description: string;
  basePriceCents: number;
  category: string;
  isActive: boolean;
  /** Image URL pulled off the source page (absolute URL). Empty string
   *  when no nearby image was found. Bulk-create writes this to
   *  MenuItem.imageUrl so the customer-facing menu card renders the
   *  operator's photos without them having to re-upload. */
  imageUrl: string;
  sizes: { name: string; priceCents: number }[];
  requiredChoices: string[];
  options: {
    name: string;
    optionType: "ADD_ON" | "REMOVAL";
    priceDeltaCents: number;
    isDefault: boolean;
  }[];
}

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Hard cap per restaurant per 30-day window. Enough headroom for a
 *  legitimate operator to iterate on their menu (try a URL, refine the
 *  prompt result, try a different URL) without letting a runaway loop
 *  burn the platform's API budget. Configurable via env var so we can
 *  bump it for enterprise tenants without a deploy. */
const PER_TENANT_QUOTA = Number(process.env.AI_MENU_EXTRACTION_MONTHLY_QUOTA ?? 20);

/** Cap on the prompt body we send to Claude. Big menu sites occasionally
 *  return 200KB+ of HTML; we trim aggressively but the cap is the
 *  safety net. ~24KB of post-strip text fits comfortably in Claude's
 *  context window with room for the system prompt + structured output. */
const MAX_PAGE_TEXT_CHARS = 24000;

// ─── Quota helpers ──────────────────────────────────────────────────────────

/**
 * Check and atomically increment the tenant's AI extraction quota.
 * Returns { allowed, remaining } so callers can either short-circuit
 * (allowed=false) or proceed and surface remaining count to the UI.
 *
 * The reset window is rolling: the first extraction after the previous
 * reset's expiry sets a fresh `aiMenuExtractionsResetAt` 30 days out
 * and the counter goes back to 1. No background job needed.
 */
async function consumeQuota(
  restaurantId: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { aiMenuExtractionsThisPeriod: true, aiMenuExtractionsResetAt: true },
  });
  if (!restaurant) {
    return { allowed: false, remaining: 0, resetAt: new Date() };
  }

  const now = new Date();
  const periodExpired = !restaurant.aiMenuExtractionsResetAt || restaurant.aiMenuExtractionsResetAt < now;

  if (periodExpired) {
    // Start a new period; counter resets to 1 (this call counts).
    const nextReset = new Date(now);
    nextReset.setDate(nextReset.getDate() + 30);
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        aiMenuExtractionsThisPeriod: 1,
        aiMenuExtractionsResetAt: nextReset,
      },
    });
    return { allowed: true, remaining: PER_TENANT_QUOTA - 1, resetAt: nextReset };
  }

  // Past this point `aiMenuExtractionsResetAt` is guaranteed non-null:
  // `periodExpired` would have been true above if it were null and we'd
  // have already returned. The `!` is a TS-only narrowing hint.
  const currentResetAt = restaurant.aiMenuExtractionsResetAt!;

  if (restaurant.aiMenuExtractionsThisPeriod >= PER_TENANT_QUOTA) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: currentResetAt,
    };
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { aiMenuExtractionsThisPeriod: { increment: 1 } },
  });
  return {
    allowed: true,
    remaining: PER_TENANT_QUOTA - restaurant.aiMenuExtractionsThisPeriod - 1,
    resetAt: currentResetAt,
  };
}

// ─── HTML processing ────────────────────────────────────────────────────────

/**
 * Strip a fetched HTML page down to a Claude-friendly text representation
 * that PRESERVES image URLs as inline markers. The model can then
 * associate `[IMG: https://...]` markers with nearby menu item names and
 * emit `imageUrl` per item.
 *
 * Heuristics:
 *  - Drop <script>, <style>, <noscript>, <svg>, <head> entirely.
 *  - Convert <img src="..."> → "[IMG: <absolute-url>]" (resolved against
 *    the source URL so a `src="/food/burger.jpg"` becomes a full URL).
 *  - Convert other tags to whitespace.
 *  - Decode common HTML entities.
 *  - Collapse runs of whitespace.
 */
function stripHtmlPreservingImages(html: string, sourceUrl: string): string {
  // Resolve relative image URLs against the source page so the
  // extracted imageUrl values are usable as <img src> later.
  const base = (() => {
    try { return new URL(sourceUrl); } catch { return null; }
  })();
  const resolve = (src: string): string => {
    if (!src) return "";
    if (/^https?:\/\//i.test(src)) return src;
    if (!base) return "";
    try { return new URL(src, base).toString(); } catch { return ""; }
  };

  // Substitute images with inline markers BEFORE the generic tag strip.
  // We pull src + alt; alt sometimes contains the item name on poorly-
  // structured menus and helps Claude pair an image with an item.
  let text = html.replace(
    /<img\b[^>]*?>/gi,
    (tag) => {
      const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      const altMatch = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
      const src = resolve(srcMatch?.[1] ?? "");
      if (!src) return " ";
      const alt = altMatch?.[1] ?? "";
      // Bracket form keeps the URL atomic so whitespace collapsing
      // below doesn't break it across newlines.
      return alt ? ` [IMG: ${src} | ${alt}] ` : ` [IMG: ${src}] `;
    },
  );

  text = text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text.slice(0, MAX_PAGE_TEXT_CHARS);
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let restaurantId: string;
  try {
    const session = await assertAdminApiRequest("MANAGER");
    restaurantId = session.restaurantId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI extraction is not configured. Please add ANTHROPIC_API_KEY to your environment variables." },
      { status: 503 },
    );
  }

  let url: string;
  try {
    const body = await req.json();
    url = String(body.url || "").trim();
    if (!url) throw new Error("Missing URL");
    new URL(url); // basic URL parse check
  } catch {
    return NextResponse.json({ error: "Please provide a valid URL." }, { status: 400 });
  }

  // ── Quota check (must happen before paying for the Claude call) ────────
  const quota = await consumeQuota(restaurantId);
  if (!quota.allowed) {
    const resetIso = quota.resetAt.toISOString();
    return NextResponse.json(
      {
        error: `You've hit this month's menu-extraction limit (${PER_TENANT_QUOTA}/${PER_TENANT_QUOTA} used). Quota resets on ${quota.resetAt.toLocaleDateString()}. Use bulk Excel upload in the meantime, or contact support to raise your cap.`,
        quota: {
          limit: PER_TENANT_QUOTA,
          remaining: 0,
          resetAt: resetIso,
        },
      },
      { status: 429 },
    );
  }

  // ── Fetch the page ─────────────────────────────────────────────────────
  let pageText: string;
  try {
    const res = await fetch(url, {
      headers: {
        // Plain UA — most sites accept this. JS-rendered sites still
        // won't work; the Playwright fallback is a separate follow-up.
        "User-Agent": "Mozilla/5.0 (compatible; LunchPadBot/1.0; +https://lunchpad.us)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    pageText = stripHtmlPreservingImages(html, url);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not fetch that URL. Make sure it's publicly accessible. (${err instanceof Error ? err.message : "Unknown error"})`,
        quota: {
          limit: PER_TENANT_QUOTA,
          remaining: quota.remaining,
          resetAt: quota.resetAt.toISOString(),
        },
      },
      { status: 400 },
    );
  }

  // ── Call Anthropic ─────────────────────────────────────────────────────
  const prompt = `You are a data extraction assistant. I will give you text from a restaurant or food vendor's website. Extract ALL menu items you can find and return them as a JSON array.

For each item include:
- name: the item name (string)
- description: a short description if available, otherwise empty string
- basePriceCents: price in cents as an integer (e.g. $12.99 → 1299). If no single price is found, use 0. For sized items (see below), set this to the smallest size's price.
- category: a category label like "Mains", "Sides", "Drinks", "Desserts", "Combos", etc. Infer from context.
- isActive: always true
- imageUrl: the URL of an image associated with this item, if one appears near the item name. Image URLs in the source text are tagged with [IMG: <url>] or [IMG: <url> | <alt-text>]. Pair an [IMG:] tag with the nearest menu item it visually represents. Return an empty string if no image is found nearby — DO NOT fabricate URLs.
- sizes: array of size variants WHEN THE ITEM IS LISTED WITH MULTIPLE PRICES.
  Examples that should produce sizes:
    "Latte — Small $4 / Medium $5 / Large $6" → sizes: [{name:"Small",priceCents:400},{name:"Medium",priceCents:500},{name:"Large",priceCents:600}]
    "Pizza 12-inch $14, 16-inch $18" → sizes: [{name:"12-inch",priceCents:1400},{name:"16-inch",priceCents:1800}]
    "Half Sandwich $7 | Whole $11" → sizes: [{name:"Half",priceCents:700},{name:"Whole",priceCents:1100}]
  Each size has:
    - name: the size label as it appears (e.g. "Small", "12-inch", "Half"). Keep operator-friendly.
    - priceCents: absolute price in cents for that size.
  When the item has a single price, leave this as an empty array [].
- requiredChoices: array of pick-one choices the customer MUST pick BEFORE adding to cart.
  Examples:
    "Build Your Own Burger (Beef / Crispy Chicken / Grilled Chicken / Vegan)" → ["Beef","Crispy Chicken","Grilled Chicken","Vegan"]
    "Chicken Wings — choose: BBQ, Buffalo, Lemon Pepper" → ["BBQ","Buffalo","Lemon Pepper"]
  Different from add-ons (which are optional). Empty array when there's no pick-one choice.
- options: array of OPTIONAL add-ons or removals. Each option has:
  - name: option name
  - optionType: "ADD_ON" or "REMOVAL"
  - priceDeltaCents: price difference in cents (0 for free options)
  - isDefault: false unless described as default/included

Be conservative: if a "price range" really represents distinct sizes, use sizes; if it's just decorative ("$10-$15") with one item, set basePriceCents to the lower number and leave sizes empty.

Return ONLY a valid JSON array. No markdown, no explanation. If no menu items are found, return [].

Website text:
${pageText}`;

  let extractedItems: MenuItemExtracted[];
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText.slice(0, 200)}`);
    }

    const data = await anthropicRes.json();
    const raw = data?.content?.[0]?.text ?? "[]";
    const cleaned = raw.replace(/^\`\`\`(?:json)?\n?/i, "").replace(/\n?\`\`\`$/i, "").trim();
    const parsed: unknown = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) throw new Error("Unexpected response shape");

    // Sanitize each item — defensive against any oddities in the model's
    // output (missing fields, wrong types, hallucinated arrays). We treat
    // each row as `Record<string, unknown>` until we've validated it,
    // then assert MenuItemExtracted on the way out.
    extractedItems = (parsed as unknown[])
      .map((rawItem): MenuItemExtracted => {
        const item = (rawItem ?? {}) as Record<string, unknown>;

        // Sizes: keep operator-set order; dedupe by name (case-insensitive).
        const seenSize = new Set<string>();
        const sizes = Array.isArray(item.sizes)
          ? (item.sizes as unknown[])
              .map((s) => {
                const sz = (s ?? {}) as Record<string, unknown>;
                return {
                  name: String(sz.name ?? "").trim(),
                  priceCents: Math.max(0, Math.round(Number(sz.priceCents) || 0)),
                };
              })
              .filter((s) => {
                if (!s.name || s.priceCents <= 0) return false;
                const k = s.name.toLowerCase();
                if (seenSize.has(k)) return false;
                seenSize.add(k);
                return true;
              })
          : [];

        const seenChoice = new Set<string>();
        const requiredChoices = Array.isArray(item.requiredChoices)
          ? (item.requiredChoices as unknown[])
              .map((c) => String(c ?? "").trim())
              .filter((c) => {
                if (!c) return false;
                const k = c.toLowerCase();
                if (seenChoice.has(k)) return false;
                seenChoice.add(k);
                return true;
              })
          : [];

        // Image URL — only accept absolute http(s) URLs to prevent
        // Claude from hallucinating relative paths or javascript: links.
        // Also reject data: URIs (could be huge inline images that
        // bloat the menu page render).
        const rawImage = String(item.imageUrl ?? "").trim();
        const imageUrl = /^https?:\/\/[^\s]+$/i.test(rawImage) ? rawImage : "";

        return {
          name: String(item.name ?? "").trim(),
          description: String(item.description ?? "").trim(),
          basePriceCents: sizes.length > 0
            ? Math.min(...sizes.map((s) => s.priceCents))
            : Math.max(0, Math.round(Number(item.basePriceCents) || 0)),
          category: String(item.category ?? "").trim(),
          isActive: item.isActive !== false,
          imageUrl,
          sizes,
          requiredChoices,
          options: Array.isArray(item.options)
            ? (item.options as unknown[]).map((rawOpt) => {
                const opt = (rawOpt ?? {}) as Record<string, unknown>;
                return {
                  name: String(opt.name ?? "").trim(),
                  optionType: (opt.optionType === "REMOVAL" ? "REMOVAL" : "ADD_ON") as "ADD_ON" | "REMOVAL",
                  priceDeltaCents: Math.max(0, Math.round(Number(opt.priceDeltaCents) || 0)),
                  isDefault: opt.isDefault === true,
                };
              })
            : [],
        };
      })
      .filter((item) => item.name.length > 0);
  } catch (err) {
    return NextResponse.json(
      {
        error: `AI extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        quota: {
          limit: PER_TENANT_QUOTA,
          remaining: quota.remaining,
          resetAt: quota.resetAt.toISOString(),
        },
      },
      { status: 500 },
    );
  }
  return NextResponse.json({
    items: extractedItems,
    // Surface quota info so the UI can render "X extractions left this
    // month" and dim the button when it hits zero.
    quota: {
      limit: PER_TENANT_QUOTA,
      remaining: quota.remaining,
      resetAt: quota.resetAt.toISOString(),
    },
  });
}
