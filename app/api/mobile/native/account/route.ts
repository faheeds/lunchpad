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
