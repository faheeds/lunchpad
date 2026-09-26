import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLabelsPdfBuffer, mapOrderToLabelRows } from "@/lib/pdf/labels";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { listOrders } from "@/lib/orders";

export async function GET(request: Request) {
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const orderIdsParam = searchParams.get("orderIds");
  const format = searchParams.get("format") ?? "pdf";

  let orders;

  if (orderIdsParam) {
    // Explicit selection (bulk "Print labels" on hand-picked rows) overrides
    // every other filter -- the operator chose these orders directly.
    const orderIds = orderIdsParam
      .split(",")
      .filter((id) => id.trim())
      .slice(0, 1000);

    orders = orderIds.length > 0
      ? await prisma.order.findMany({
          where: { restaurantId, id: { in: orderIds } },
          include: { school: true, deliveryDate: true, student: true, items: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
  } else {
    // Same filters the orders list and CSV export use (fromDate/toDate,
    // deliveryDateId, schoolId, status, archived, search). Previously this
    // route only ever looked at deliveryDateId, so filtering the orders
    // list by a date range (without ALSO picking one exact date from the
    // separate "Delivery date" dropdown) had no effect on the labels PDF --
    // it silently printed every paid order for the restaurant.
    orders = await listOrders({
      restaurantId,
      deliveryDateId: searchParams.get("deliveryDateId") ?? undefined,
      schoolId: searchParams.get("schoolId") ?? undefined,
      // Labels are for kitchen prep, so default to PAID-only (matches the
      // previous hardcoded behavior) unless the operator explicitly chose
      // a different status filter on the orders list.
      status: searchParams.get("status") ?? "PAID",
      archived: searchParams.get("archived") ?? "exclude",
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      search: searchParams.get("q") ?? undefined,
    });
  }

  if (format === "json") {
    return NextResponse.json({ labels: mapOrderToLabelRows(orders) });
  }

  const buffer = await generateLabelsPdfBuffer(orders);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="student-labels.pdf"'
    }
  });
}
