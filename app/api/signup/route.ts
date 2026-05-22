import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendWelcomeRestaurantEmail } from "@/lib/email/service";
import { logInfo, logWarn, logException } from "@/lib/log";

export async function POST(request: Request) {
  try {
    logInfo("signup_request_started");

    // ── Parse body ──────────────────────────────────────────────
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
      logWarn("signup_invalid_json");
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { restaurantName, slug, contactEmail, ownerName, password, plan } = body;

    // ── Validate inputs ─────────────────────────────────────────
    if (!restaurantName?.trim() || !slug?.trim() || !contactEmail?.trim() || !ownerName?.trim() || !password) {
      logWarn("signup_missing_fields");
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    if (!/^[a-z0-9-]{2,30}$/.test(slug)) {
      logWarn("signup_invalid_slug", { slug });
      return NextResponse.json({
        error: "Subdomain must be 2-30 characters: lowercase letters, numbers, and hyphens only."
      }, { status: 400 });
    }

    if (password.length < 8) {
      logWarn("signup_weak_password");
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    // ── Check slug uniqueness ───────────────────────────────────
    // Use select:{id:true} so Prisma never requests columns that may not
    // exist yet in the DB (e.g. customDomain before the migration runs).
    const existing = await prisma.restaurant.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (existing) {
      logWarn("signup_slug_taken", { slug });
      return NextResponse.json({ error: "That subdomain is already taken. Please choose another." }, { status: 409 });
    }

    // ── Create restaurant + owner ───────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const validPlans = ["STARTER", "GROWTH", "SCALE"];
    const selectedPlan = validPlans.includes(plan) ? plan : "STARTER";

    // select:{id,slug} avoids requesting columns not yet in the DB
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
      select: { id: true, slug: true },
    });

    logInfo("signup_restaurant_created", {
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      plan: selectedPlan,
    });

    // Fire-and-forget welcome email — never blocks or throws
    sendWelcomeRestaurantEmail(restaurant.id).catch(() => {});

    // Auto-register the restaurant's subdomain in Vercel if the API token is
    // configured. With Vercel Pro + a *.lunchpad.us wildcard this isn't
    // needed, but on Hobby (no wildcard) we rely on this. Fire-and-forget so
    // signup latency isn't tied to Vercel API round-trips. If it fails, the
    // operator's site won't resolve until someone adds the domain manually —
    // we log loudly so it can be picked up in Vercel logs.
    if (process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID) {
      const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";
      const subdomain = `${restaurant.slug}.${rootDomain}`;
      import("@/lib/vercel-domains")
        .then(({ addDomainToProject }) => addDomainToProject(subdomain))
        .then((result) => {
          if (!result.ok) {
            logWarn("signup_vercel_domain_registration_failed", {
              restaurantId: restaurant.id,
              subdomain,
              error: result.error,
            });
          } else {
            logInfo("signup_vercel_domain_registered", {
              restaurantId: restaurant.id,
              subdomain,
            });
          }
        })
        .catch((e) => {
          logWarn("signup_vercel_domain_registration_error", {
            restaurantId: restaurant.id,
            subdomain,
            errorMessage: e instanceof Error ? e.message : String(e),
          });
        });
    }

    return NextResponse.json({ ok: true, restaurantId: restaurant.id, slug: restaurant.slug });

  } catch (error) {
    // Top-level catch — always return JSON so the client never gets an empty/HTML response
    logException(error, "signup_unhandled_error");
    const message = error instanceof Error ? error.message : "Failed to create account. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
