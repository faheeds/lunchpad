import { Parser } from "json2csv";
import { NextResponse } from "next/server";
import { formatList } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest("STAFF"));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderIdsParam = searchParams.get("orderIds");

  if (!orderIdsParam) {
    return NextResponse.json(
      { error: "No order IDs provided" },
      { status: 400 }
    );
  }

  const orderIds = orderIdsParam
    .split(",")
    .filter((id) => id.trim())
    .slice(0, 1000);

  if (orderIds.length === 0) {
    return NextResponse.json(
      { error: "No valid order IDs provided" },
      { status: 400 }
    );
  }

  // Tenant-scoped: only export orders for this admin's restaurant.
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      id: { in: orderIds },
    },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) {
    return NextResponse.json(
      { error: "No orders found" },
      { status: 404 }
    );
  }

  const rows = orders.map((order) => ({
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryDate: formatInTimeZone(
      order.deliveryDate.deliveryDate,
      order.school.timezone,
      "yyyy-MM-dd"
    ),
    school: order.school.name,
    studentName: order.student.studentName,
    grade: order.student.grade,
    teacher: order.student.teacherName ?? "",
    classroom: order.student.classroom ?? "",
    item: order.items.map((item) => item.itemNameSnapshot).join(", "),
    additions: formatList(order.items.flatMap((item) => item.additions)),
    removals: formatList(order.items.flatMap((item) => item.removals)),
    allergyNotes: formatList(order.items.map((item) => item.allergyNotes).filter(Boolean)),
    specialInstructions: order.specialInstructions ?? "",
    parentName: order.parentName,
    totalPaid: (order.totalCents / 100).toFixed(2),
  }));

  const csv = new Parser().parse(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="orders-export.csv"',
    },
  });
}
