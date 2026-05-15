import { Parser } from "json2csv";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatList } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { assertAdminApiRequest } from "@/lib/admin-auth";

export async function GET(request: Request) {
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderIds = searchParams.getAll("orderIds");

  if (!orderIds.length) {
    return NextResponse.json({ error: "Select at least one order." }, { status: 400 });
  }

  // Tenant-scoped: fetch only orders for this restaurant
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

  if (!orders.length) {
    return NextResponse.json({ error: "No orders found." }, { status: 404 });
  }

  const rows = orders.map((order) => ({
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryDate: formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "yyyy-MM-dd"),
    school: order.school.name,
    studentName: order.student.studentName,
    grade: order.student.grade,
    teacher: order.student.teacherName ?? "",
    classroom: order.student.classroom ?? "",
    item: order.items.map((item) => item.itemNameSnapshot).join(", "),
    additions: formatList(order.items.flatMap((item) => item.additions)),
    removals: formatList(order.items.flatMap((item) => item.removals)),
    allergyNotes: order.items.map((item) => item.allergyNotes).find(Boolean) ?? "",
    specialInstructions: order.specialInstructions ?? "",
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
