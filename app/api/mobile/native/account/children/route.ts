/**
 * POST /api/mobile/native/account/children
 *
 * Add a child to the authenticated parent's account.
 * Auth: Bearer JWT required.
 *
 * Body: { schoolId: string, studentName: string, grade: string, allergyNotes?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);
    const body = await request.json();

    if (!body.schoolId || !body.studentName) {
      return NextResponse.json(
        { error: "schoolId and studentName are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const child = await prisma.parentChild.create({
      data: {
        parentUserId: auth.parentUserId,
        schoolId: body.schoolId,
        studentName: body.studentName.trim(),
        grade: (body.grade ?? "").trim() || "\u2014",
        allergyNotes: body.allergyNotes?.trim() ?? null,
      },
      include: { school: { select: { id: true, name: true, locationType: true } } },
    });

    return NextResponse.json(
      {
        id: child.id,
        schoolId: child.schoolId,
        schoolName: child.school.name,
        locationType: child.school.locationType,
        studentName: child.studentName,
        grade: child.grade,
        allergyNotes: child.allergyNotes ?? "",
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
