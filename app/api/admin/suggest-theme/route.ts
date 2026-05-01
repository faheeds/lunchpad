import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";

const DISPLAY_IDS = ["Oswald", "Bebas Neue", "Montserrat", "Playfair Display", "Raleway"];
const BODY_IDS    = ["Inter", "Poppins", "Open Sans", "Lato"];

export async function POST(req: NextRequest) {
  try {
    await assertAdminApiRequest("OWNER");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
    }

    const { restaurantName, description } = await req.json();
    if (!restaurantName) {
      return NextResponse.json({ error: "restaurantName required" }, { status: 400 });
    }

    const prompt = `You are a professional brand designer for food & restaurant apps.

A restaurant called "${restaurantName}" wants a theme for their hot lunch ordering app.
${description ? `Additional context: ${description}` : ""}

Suggest a cohesive, visually striking theme. Respond ONLY with valid JSON in exactly this shape:

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
- darkColor: the dark header/hero background (make it rich and deep, not just black)
- primaryColor: main action color (buttons, icons) — must have good contrast on white
- accentColor: secondary highlight — warm or complementary, contrasts well on darkColor
- heroTitleColor: HOT LUNCH heading color — usually white or very light
- heroAccentColor: star/subheading text over hero — eye-catching, warm
- bodyTextColor: body copy on white cards — dark but not necessarily pure black
- All hex values must be valid 6-digit hex codes
- Fonts must be exactly one of the provided options (case-sensitive)`;

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

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate fonts are from our lists
    if (!DISPLAY_IDS.includes(parsed.displayFont)) parsed.displayFont = "Oswald";
    if (!BODY_IDS.includes(parsed.bodyFont))       parsed.bodyFont    = "Inter";

    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI suggestion failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
