import { Parser } from "json2csv";
import { NextResponse } from "next/server";
import { listOrders } from "@/lib/orders";
import { formatList } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { requireAdmin } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurant = await requireRestaurant();
  const { searchParams } = new URL(request.url);
  const deliveryDateId = searchParams.get("deliveryDateId") ?? undefined;
  const schoolId = searchParams.get("schoolId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const archived = searchParams.get("archived") ?? "exclude";

  const orders = await listOrders({
    restaurantId: restaurant.id,
    deliveryDateId,
    schoolIds: schoolId ? [schoolId] : [],
    status,
    archived,
  });

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
      "Content-Disposition": 'attachment; filename="orders-export.csv"'
    }
  });
}
