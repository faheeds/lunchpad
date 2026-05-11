/**
 * DELETE /api/mobile/native/weekly-plans/[id]
 *
 * Remove a single weekly lunch plan. Tenant-scoped: the row must belong
 * to the calling parent.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMobileAuth(request);
    const { id } = await context.params;

    // findFirst → delete pattern so we can verify ownership before
    // mutating. deleteMany would also work but we want a 404 on missing.
    const plan = await prisma.weeklyLunchPlan.findFirst({
      where: { id, parentUserId: auth.parentUserId },
    });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404, headers: CORS_HEADERS });
    }

    await prisma.weeklyLunchPlan.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to delete plan";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
