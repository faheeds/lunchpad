/**
 * GET /api/mobile/native/orders
 *
 * Returns the authenticated parent's order history (most recent first).
 * Auth: Bearer JWT required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileAuth, CORS_HEADERS, options as corsOptions } from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);

    const orders = await prisma.order.findMany({
      where: {
        parentUserId: auth.parentUserId,
        status: { in: ["PAID", "PENDING"] },
        archivedAt: null,
      },
      include: {
        school: { select: { name: true, timezone: true } },
        deliveryDate: { select: { deliveryDate: true } },
        items: {
          select: {
            itemNameSnapshot: true,
            lineTotalCents: true,
            additions: true,
            removals: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        deliveryDate: o.deliveryDate.deliveryDate.toISOString(),
        schoolName: o.school.name,
        totalCents: o.totalCents,
        createdAt: o.createdAt.toISOString(),
        parentChildId: o.parentChildId,
        deliveryDateId: o.deliveryDateId,
        items: o.items.map((i) => ({
          name: i.itemNameSnapshot,
          lineTotalCents: i.lineTotalCents,
          additions: i.additions,
          removals: i.removals,
        })),
      })),
      { headers: CORS_HEADERS }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
