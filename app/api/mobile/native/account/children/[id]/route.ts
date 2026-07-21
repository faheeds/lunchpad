/**
 * PATCH  /api/mobile/native/account/children/[id] — edit a saved child
 * DELETE /api/mobile/native/account/children/[id] — soft-delete a child
 *
 * Auth: Bearer JWT required (requireMobileAuth).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMobileAuth(request);
    const { id } = await context.params;

    const body = await request.json();
    if (!body.studentName) {
      return NextResponse.json(
        { error: "studentName is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Ownership + tenant pre-check
    const child = await prisma.parentChild.findFirst({
      where: { id, parentUserId: auth.parentUserId, archivedAt: null },
      include: { school: { select: { restaurantId: true, id: true, name: true, locationType: true } } },
    });
    if (!child || child.school.restaurantId !== auth.restaurantId) {
      return NextResponse.json({ error: "Child not found." }, { status: 404, headers: CORS_HEADERS });
    }

    const updated = await prisma.parentChild.update({
      where: { id },
      data: {
        studentName: (body.studentName as string).trim(),
        ...(body.schoolId !== undefined && { schoolId: body.schoolId as string }),
        ...(body.grade !== undefined && { grade: ((body.grade as string) ?? "").trim() || "—" }),
        ...(body.allergyNotes !== undefined && { allergyNotes: (body.allergyNotes as string)?.trim() ?? null }),
      },
      include: { school: { select: { id: true, name: true, locationType: true } } },
    });

    return NextResponse.json(
      {
        id: updated.id,
        schoolId: updated.schoolId,
        schoolName: updated.school.name,
        locationType: updated.school.locationType,
        studentName: updated.studentName,
        grade: updated.grade,
        allergyNotes: updated.allergyNotes ?? "",
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMobileAuth(request);
    const { id } = await context.params;

    // Ownership + tenant pre-check
    const child = await prisma.parentChild.findFirst({
      where: { id, parentUserId: auth.parentUserId, archivedAt: null },
      include: { school: { select: { restaurantId: true } } },
    });
    if (!child || child.school.restaurantId !== auth.restaurantId) {
      return NextResponse.json({ error: "Child not found." }, { status: 404, headers: CORS_HEADERS });
    }

    await prisma.$transaction([
      prisma.weeklyLunchPlan.deleteMany({
        where: { parentUserId: auth.parentUserId, parentChildId: id },
      }),
      prisma.parentChild.update({
        where: { id },
        data: { archivedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
