import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { env } from "@/lib/env";

export interface MenuItemExtracted {
  name: string;
  description: string;
  basePriceCents: number;
  category: string;
  isActive: boolean;
  /** Size variants extracted from the menu — e.g. Small/Medium/Large at
   *  different prices. Empty array when the item is single-priced.
   *  When non-empty, basePriceCents falls through and only `sizes` is
   *  consulted at order time (matches the runtime semantics in lib/orders.ts). */
  sizes: {
    name: string;
    priceCents: number;
  }[];
  /** Required pick-one choices extracted from the menu, e.g. "Beef vs
   *  Chicken vs Vegan" on a build-your-own item. Empty when none. */
  requiredChoices: string[];
  options: {
    name: string;
    optionType: "ADD_ON" | "REMOVAL";
    priceDeltaCents: number;
    isDefault: boolean;
  }[];
}

export async function POST(req: NextRequest) {
  try {
    await assertAdminApiRequest();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI extraction is not configured. Please add ANTHROPIC_API_KEY to your environment variables." },
      { status: 503 }
    );
  }

  let url: string;
  try {
    const body = await req.json();
    url = String(body.url || "").trim();
    if (!url) throw new Error("Missing URL");
    // Basic URL validation
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Please provide a valid URL." }, { status: 400 });
  }

  // ── Fetch the page ─────────────────────────────────────────────────────────
  let pageText: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LunchPadBot/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Strip HTML tags and collapse whitespace for cleaner context
    pageText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 12000); // cap to keep prompt size reasonable
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch that URL. Make sure it's publicly accessible. (${err instanceof Error ? err.message : "Unknown error"})` },
      { status: 400 }
    );
  }

  // ── Call Anthropic ─────────────────────────────────────────────────────────
  const prompt = `You are a data extraction assistant. I will give you text from a restaurant or food vendor's website. Extract ALL menu items you can find and return them as a JSON array.

For each item include:
- name: the item name (string)
- description: a short description if available, otherwise empty string
- basePriceCents: price in cents as an integer (e.g. $12.99 → 1299). If no single price is found, use 0. For sized items (see below), set this to the smallest size's price.
- category: a category label like "Mains", "Sides", "Drinks", "Desserts", "Combos", etc. Infer from context.
- isActive: always true
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
    // Parse — strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    extractedItems = JSON.parse(cleaned);

    if (!Array.isArray(extractedItems)) throw new Error("Unexpected response shape");

    // Sanitize each item — defensive against any oddities in the model's
    // output (missing fields, wrong types, hallucinated arrays). Anything
    // we can't make sense of gets dropped or coerced to a safe default.
    extractedItems = extractedItems.map((item) => {
      // Sizes: keep operator-set order from the model (Small→Large feels
      // natural). Dedupe by name (case-insensitive) so a sloppy extraction
      // doesn't produce duplicate rows the UI then has to reconcile.
      const seenSize = new Set<string>();
      const sizes = Array.isArray((item as Record<string, unknown>).sizes)
        ? ((item as { sizes: Record<string, unknown>[] }).sizes
            .map((s) => ({
              name: String(s?.name ?? "").trim(),
              priceCents: Math.max(0, Math.round(Number(s?.priceCents) || 0)),
            }))
            .filter((s) => {
              if (!s.name || s.priceCents <= 0) return false;
              const k = s.name.toLowerCase();
              if (seenSize.has(k)) return false;
              seenSize.add(k);
              return true;
            }))
        : [];

      const seenChoice = new Set<string>();
      const requiredChoices = Array.isArray((item as Record<string, unknown>).requiredChoices)
        ? ((item as { requiredChoices: unknown[] }).requiredChoices
            .map((c) => String(c ?? "").trim())
            .filter((c) => {
              if (!c) return false;
              const k = c.toLowerCase();
              if (seenChoice.has(k)) return false;
              seenChoice.add(k);
              return true;
            }))
        : [];

      return {
        name: String(item.name ?? "").trim(),
        description: String(item.description ?? "").trim(),
        // For sized items: prefer the cheapest size as a fallback
        // basePriceCents (kept on the row so a future "sizes empty" edit
        // by the operator still has a sensible base price).
        basePriceCents: sizes.length > 0
          ? Math.min(...sizes.map((s) => s.priceCents))
          : Math.max(0, Math.round(Number(item.basePriceCents) || 0)),
        category: String(item.category ?? "").trim(),
        isActive: item.isActive !== false,
        sizes,
        requiredChoices,
        options: Array.isArray(item.options)
          ? item.options.map((opt: Record<string, unknown>) => ({
              name: String(opt.name ?? "").trim(),
              optionType: (opt.optionType === "REMOVAL" ? "REMOVAL" : "ADD_ON") as "ADD_ON" | "REMOVAL",
              priceDeltaCents: Math.max(0, Math.round(Number(opt.priceDeltaCents) || 0)),
              isDefault: opt.isDefault === true,
            }))
          : [],
      };
    }).filter((item) => item.name.length > 0);
  } catch (err) {
    return NextResponse.json(
      { error: `AI extraction failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: extractedItems });
}
