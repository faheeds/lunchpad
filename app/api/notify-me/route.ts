import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  restaurantId: z.string().min(1),
  email: z.string().email("Valid email is required"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { restaurantId, email } = parsed.data;

  try {
    // Verify restaurant exists
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found." },
        { status: 404 }
      );
    }

    // Upsert: if the email already exists for this restaurant, just update
    // (idempotent). If it's new, create it.
    await prisma.deliveryNotifyRequest.upsert({
      where: { restaurantId_email: { restaurantId, email } },
      update: {}, // No-op if it already exists
      create: { restaurantId, email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify-me] Failed:", err);
    return NextResponse.json(
      { error: "Failed to submit. Please try again." },
      { status: 500 }
    );
  }
}
