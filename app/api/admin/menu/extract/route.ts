import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { env } from "@/lib/env";

export interface MenuItemExtracted {
  name: string;
  description: string;
  basePriceCents: number;
  category: string;
  isActive: boolean;
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
- basePriceCents: price in cents as an integer (e.g. $12.99 → 1299). If no price found, use 0.
- category: a category label like "Mains", "Sides", "Drinks", "Desserts", "Combos", etc. Infer from context.
- isActive: always true
- options: array of add-ons or removals if mentioned. Each option has:
  - name: option name
  - optionType: "ADD_ON" or "REMOVAL"
  - priceDeltaCents: price difference in cents (0 for free options)
  - isDefault: false unless described as default/included

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

    // Sanitize each item
    extractedItems = extractedItems.map((item) => ({
      name: String(item.name ?? "").trim(),
      description: String(item.description ?? "").trim(),
      basePriceCents: Math.max(0, Math.round(Number(item.basePriceCents) || 0)),
      category: String(item.category ?? "").trim(),
      isActive: item.isActive !== false,
      options: Array.isArray(item.options)
        ? item.options.map((opt: Record<string, unknown>) => ({
            name: String(opt.name ?? "").trim(),
            optionType: opt.optionType === "REMOVAL" ? "REMOVAL" : "ADD_ON",
            priceDeltaCents: Math.max(0, Math.round(Number(opt.priceDeltaCents) || 0)),
            isDefault: opt.isDefault === true,
          }))
        : [],
    })).filter((item) => item.name.length > 0);
  } catch (err) {
    return NextResponse.json(
      { error: `AI extraction failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: extractedItems });
}
