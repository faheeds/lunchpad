import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";

const DISPLAY_IDS = [
  "Fraunces","Playfair Display","Montserrat","Raleway","Poppins",
  "Urbanist","Exo 2","Nunito","DM Sans",
];
const BODY_IDS = [
  "Inter","Open Sans","Roboto","Lato","Poppins","Nunito Sans",
  "DM Sans","Work Sans","Mulish","Source Sans 3","Karla","Noto Sans",
];

export async function POST(req: NextRequest) {
  try {
    await assertAdminApiRequest("OWNER");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });

    const { restaurantName, description } = await req.json();
    if (!restaurantName) return NextResponse.json({ error: "restaurantName required" }, { status: 400 });

    const prompt = `You are a professional brand designer for food & restaurant apps. Your design philosophy emphasizes premium, restrained, and editorial aesthetics over loud or coupon-flyer looks.

A restaurant called "${restaurantName}" wants a theme for their hot lunch ordering app.
${description ? `Additional context: ${description}` : ""}

Suggest a cohesive, premium, and sophisticated theme. By default, lean toward warm, muted, and refined tones and typography. Only choose high-saturation or bold treatments if the restaurant's own description clearly signals that tone (e.g., "loud sports bar" or "energy-focused"). Respond ONLY with valid JSON in exactly this shape:

{
  "darkColor": "#hex",
  "primaryColor": "#hex",
  "accentColor": "#hex",
  "heroTitleColor": "#hex",
  "heroAccentColor": "#hex",
  "bodyTextColor": "#hex",
  "displayFont": "one of: ${DISPLAY_IDS.join(" | ")}",
  "bodyFont": "one of: ${BODY_IDS.join(" | ")}",
  "reasoning": "1-2 sentence explanation of why this combo suits the brand"
}

Rules:
- darkColor: rich, deep, warm-toned header/hero background (e.g., sage, charcoal, chocolate, navy, warm brown) — not plain black, not neon
- primaryColor: main action color (buttons, icons) — strong contrast on white; prefer warm, muted, or sophisticated tones (e.g., warm terracotta, deep teal, earthy green) over saturated/neon unless the description calls for high energy
- accentColor: secondary highlight — warm, muted, and complementary; readable on darkColor; avoid oversaturation
- heroTitleColor: HOT LUNCH heading — usually white or very light
- heroAccentColor: star/subheading text over hero — warm and readable, but not garish or oversaturated
- bodyTextColor: body copy on white cards — dark but not pure black (e.g., charcoal, dark gray)
- displayFont: choose from the curated list; favor editorial serif (Fraunces) or elegant sans-serif (Playfair Display, Montserrat, Raleway) for a premium feel; avoid all-caps-heavy typefaces
- bodyFont: clean, readable serif or sans-serif; excellent contrast on white
- All hex values must be valid 6-digit hex codes
- displayFont and bodyFont must be EXACTLY one of the provided options (case-sensitive)
- Never suggest results that resemble fast-food banners, coupons, or flyers — your goal is to evoke a premium, editorial, online-ordering experience`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    const parsed = JSON.parse(jsonMatch[0]);

    if (!DISPLAY_IDS.includes(parsed.displayFont)) parsed.displayFont = "Fraunces";
    if (!BODY_IDS.includes(parsed.bodyFont))       parsed.bodyFont    = "Inter";

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI suggestion failed" }, { status: 500 });
  }
}
