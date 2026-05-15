import { OrderStatus, Prisma } from "@prisma/client";
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
  const orderIdsParam = searchParams.get("orderIds");
  const format = searchParams.get("format") ?? "pdf";

  let whereCondition: Prisma.OrderWhereInput = {
    restaurantId,
    status: OrderStatus.PAID,
    archivedAt: null,
  };

  // If orderIds is provided, use those; otherwise filter by deliveryDateId
  if (orderIdsParam) {
    const orderIds = orderIdsParam
      .split(",")
      .filter((id) => id.trim())
      .slice(0, 1000);
    if (orderIds.length > 0) {
      whereCondition.id = { in: orderIds };
    }
  } else if (deliveryDateId) {
    whereCondition.deliveryDateId = deliveryDateId;
  }

  // Tenant-scoped: only return orders for this admin's restaurant.
  const orders = await prisma.order.findMany({
    where: whereCondition,
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
