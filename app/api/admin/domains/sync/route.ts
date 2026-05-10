/**
 * One-shot Vercel domain re-sync.
 *
 *   POST /api/admin/domains/sync
 *     Header: x-admin-secret: <SYNC_SECRET>
 *
 * Walks every active restaurant in the DB and registers its
 * `<slug>.<ROOT_DOMAIN>` with Vercel via the project domains API. Idempotent:
 * domains that already exist on the project come back as `alreadyExists`
 * and aren't re-added. Use this to:
 *   - Backfill restaurants that were created before VERCEL_API_TOKEN was set
 *   - Fix subdomains where the fire-and-forget auto-register at signup
 *     silently failed
 *
 * Auth: bearer-style header `x-admin-secret` compared against the
 * `DOMAIN_SYNC_SECRET` env var (or `NEXTAUTH_SECRET` as a fallback so this
 * works without an additional env). Set DOMAIN_SYNC_SECRET in Vercel to
 * something only you know if you want a dedicated secret.
 *
 * Returns a per-restaurant report so you can see what was added / what was
 * already there / what failed and why.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.DOMAIN_SYNC_SECRET || process.env.NEXTAUTH_SECRET;
  if (!expected) return false;
  const got = req.headers.get("x-admin-secret");
  return Boolean(got) && got === expected;
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized — pass `x-admin-secret: <DOMAIN_SYNC_SECRET>` header." },
      { status: 401 },
    );
  }

  if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return NextResponse.json(
      {
        error:
          "Vercel API not configured. Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID in Vercel → Settings → Environment Variables (and VERCEL_TEAM_ID if the project is owned by a team).",
      },
      { status: 500 },
    );
  }

  const rootDomain = process.env.ROOT_DOMAIN || "lunchpad.us";
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, customDomain: true },
    orderBy: { createdAt: "asc" },
  });

  const { addDomainToProject } = await import("@/lib/vercel-domains");

  const report: Array<{
    restaurantId: string;
    name: string;
    domain: string;
    status: "added" | "already_exists" | "failed";
    error?: string;
  }> = [];

  // Walk sequentially — Vercel rate-limits the domains API and the per-call
  // latency is small, so a tight serial loop is the simplest correct thing.
  for (const r of restaurants) {
    const subdomain = `${r.slug}.${rootDomain}`;
    const result = await addDomainToProject(subdomain);
    if (!result.ok) {
      report.push({ restaurantId: r.id, name: r.name, domain: subdomain, status: "failed", error: result.error });
    } else if (result.alreadyExists) {
      report.push({ restaurantId: r.id, name: r.name, domain: subdomain, status: "already_exists" });
    } else {
      report.push({ restaurantId: r.id, name: r.name, domain: subdomain, status: "added" });
    }

    // Custom domain — register it too if the operator has set one.
    if (r.customDomain) {
      const customResult = await addDomainToProject(r.customDomain);
      if (!customResult.ok) {
        report.push({
          restaurantId: r.id,
          name: r.name,
          domain: r.customDomain,
          status: "failed",
          error: customResult.error,
        });
      } else if (customResult.alreadyExists) {
        report.push({ restaurantId: r.id, name: r.name, domain: r.customDomain, status: "already_exists" });
      } else {
        report.push({ restaurantId: r.id, name: r.name, domain: r.customDomain, status: "added" });
      }
    }
  }

  const summary = {
    total: report.length,
    added: report.filter((r) => r.status === "added").length,
    alreadyExists: report.filter((r) => r.status === "already_exists").length,
    failed: report.filter((r) => r.status === "failed").length,
  };

  return NextResponse.json({ summary, report });
}
