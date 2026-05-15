import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLabelsPdfBuffer, mapOrderToLabelRows } from "@/lib/pdf/labels";
import { assertAdminApiRequest } from "@/lib/admin-auth";

export async function GET(request: Request) {
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const deliveryDateId = searchParams.get("deliveryDateId");
  const orderIds = searchParams.getAll("orderIds");
  const format = searchParams.get("format") ?? "pdf";

  // Tenant-scoped: only return orders for this admin's restaurant.
  let whereClause: any = {
    restaurantId,
    status: OrderStatus.PAID,
    archivedAt: null,
  };

  // If specific order IDs are provided, use those (bulk action from toolbar)
  if (orderIds.length > 0) {
    whereClause.id = { in: orderIds.filter((id) => typeof id === "string") };
  } else if (deliveryDateId) {
    // Otherwise use deliveryDateId if provided (full-page label print)
    whereClause.deliveryDateId = deliveryDateId;
  }

  const orders = await prisma.order.findMany({
    where: whereClause,
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: true
    },
    orderBy: { createdAt: "asc" }
  });

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
