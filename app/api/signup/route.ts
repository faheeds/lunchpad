import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  let body: {
    restaurantName: string;
    slug: string;
    contactEmail: string;
    ownerName: string;
    password: string;
    plan: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { restaurantName, slug, contactEmail, ownerName, password, plan } = body;

  if (!restaurantName?.trim() || !slug?.trim() || !contactEmail?.trim() || !ownerName?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  // Validate slug: lowercase letters, numbers, hyphens only
  if (!/^[a-z0-9-]{2,30}$/.test(slug)) {
    return NextResponse.json({
      error: "Subdomain must be 2-30 characters: lowercase letters, numbers, and hyphens only."
    }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Check slug uniqueness
  const existing = await prisma.restaurant.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "That subdomain is already taken." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const validPlans = ["STARTER", "GROWTH", "SCALE"];
  const selectedPlan = validPlans.includes(plan) ? plan : "STARTER";

  try {
    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantName.trim(),
        slug: slug.trim().toLowerCase(),
        contactEmail: contactEmail.trim().toLowerCase(),
        plan: selectedPlan as "STARTER" | "GROWTH" | "SCALE",
        subscriptionStatus: "TRIAL",
        trialEndsAt,
        admins: {
          create: {
            email: contactEmail.trim().toLowerCase(),
            name: ownerName.trim(),
            passwordHash,
            role: "OWNER",
          },
        },
      },
    });

    return NextResponse.json({ ok: true, restaurantId: restaurant.id, slug: restaurant.slug });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
