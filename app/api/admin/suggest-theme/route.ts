import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";

const DISPLAY_IDS = [
  "Oswald","Bebas Neue","Anton","Barlow Condensed","Fjalla One",
  "Roboto Condensed","Montserrat","Raleway","Playfair Display",
  "Urbanist","Exo 2","Nunito","DM Sans","Kanit","Poppins",
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
- darkColor: rich, deep header/hero background — not plain black
- primaryColor: main action color (buttons, icons) — strong contrast on white
- accentColor: secondary highlight — warm or complementary, readable on darkColor
- heroTitleColor: HOT LUNCH heading — usually white or very light
- heroAccentColor: star/subheading text over hero — warm, eye-catching
- bodyTextColor: body copy on white cards — dark but not pure black
- All hex values must be valid 6-digit hex codes
- displayFont and bodyFont must be EXACTLY one of the provided options (case-sensitive)`;

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

    if (!DISPLAY_IDS.includes(parsed.displayFont)) parsed.displayFont = "Oswald";
    if (!BODY_IDS.includes(parsed.bodyFont))       parsed.bodyFont    = "Inter";

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI suggestion failed" }, { status: 500 });
  }
}
