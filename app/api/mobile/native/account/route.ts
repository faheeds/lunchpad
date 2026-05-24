/**
 * GET /api/mobile/native/account
 *
 * Returns the authenticated parent's profile and saved children.
 * Auth: Bearer JWT required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);

    const parent = await prisma.parentUser.findUnique({
      where: { id: auth.parentUserId },
      include: {
        children: {
          where: { archivedAt: null },
          orderBy: { studentName: "asc" },
          include: { school: { select: { id: true, name: true } } },
        },
      },
    });

    if (!parent) {
      return NextResponse.json(
        { error: "Parent not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        id: parent.id,
        email: parent.email,
        name: parent.name,
        children: parent.children.map((c) => ({
          id: c.id,
          schoolId: c.schoolId,
          schoolName: c.school.name,
          studentName: c.studentName,
          grade: c.grade,
          allergyNotes: c.allergyNotes ?? "",
        })),
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}

/**
 * DELETE /api/mobile/native/account
 *
 * Permanently deletes the authenticated parent's account and personal
 * data. Required by App Store Guideline 5.1.1(v) — any app with account
 * creation must allow in-app account deletion.
 *
 * Paid orders are financial records the lunch provider must keep, so they
 * are NOT deleted: Order.parentUserId / parentChildId are onDelete:SetNull,
 * meaning the orders survive with the personal link severed (anonymized).
 *
 * Auth: Bearer JWT required.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);

    const parent = await prisma.parentUser.findUnique({
      where: { id: auth.parentUserId },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json(
        { error: "Parent not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Delete personal data in dependency order inside one transaction.
    // WeeklyCheckoutBatchItem.parentChild is onDelete:Restrict, so the
    // batch items must go before the ParentChild rows.
    await prisma.$transaction(async (tx) => {
      await tx.weeklyCheckoutBatchItem.deleteMany({
        where: { weeklyCheckoutBatch: { parentUserId: parent.id } },
      });
      await tx.weeklyCheckoutBatch.deleteMany({ where: { parentUserId: parent.id } });
      await tx.weeklyLunchPlan.deleteMany({ where: { parentUserId: parent.id } });
      await tx.parentChild.deleteMany({ where: { parentUserId: parent.id } });
      await tx.parentUser.delete({ where: { id: parent.id } });
    });

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to delete account";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
