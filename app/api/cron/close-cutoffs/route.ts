import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/cron/close-cutoffs
 *
 * Sweeps delivery dates whose cutoff time has passed and marks them
 * orderingOpen = false. Called by Vercel Cron every 15 minutes.
 *
 * Protected by the CRON_SECRET env var — Vercel sends it as the
 * Authorization header automatically when configured in vercel.json.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, require the shared secret. In dev it's optional.
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const result = await prisma.deliveryDate.updateMany({
    where: {
      orderingOpen: true,
      cutoffAt: { lt: now },
    },
    data: { orderingOpen: false },
  });

  return NextResponse.json({ ok: true, closed: result.count, at: now.toISOString() });
}
