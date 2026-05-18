import type { Metadata } from "next";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mapOrderToLabelRows } from "@/lib/pdf/labels";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print Labels | LunchPad Admin",
};

export default async function LabelsPrintPage({
  searchParams
}: {
  searchParams: Promise<{ deliveryDateId?: string; orderIds?: string }>;
}) {
  await requireAdminRole("STAFF");
  const restaurant = await requireRestaurant();
  const params = await searchParams;

  let whereCondition: Prisma.OrderWhereInput = {
    restaurantId: restaurant.id,
    status: OrderStatus.PAID,
    archivedAt: null,
  };

  // If orderIds is provided, use those; otherwise filter by deliveryDateId
  if (params.orderIds) {
    const orderIds = params.orderIds
      .split(",")
      .filter((id) => id.trim())
      .slice(0, 1000);
    if (orderIds.length > 0) {
      whereCondition.id = { in: orderIds };
    }
  } else if (params.deliveryDateId) {
    whereCondition.deliveryDateId = params.deliveryDateId;
  }

  // Tenant-scoped: only show orders for the current restaurant.
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

  const labels = mapOrderToLabelRows(orders);

  return (
    <main className="min-h-screen bg-white p-6 print:p-0">
      <style>{`
        @media print {
          .label-grid { gap: 8px; }
          .label-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="label-grid grid grid-cols-2 gap-3">
        {labels.map((label) => (
          <div key={label.orderId} className="label-card rounded-xl border border-slate-300 p-3 text-[11px] leading-4">
            <>
              <p className="text-sm font-bold">{label.studentName}</p>
              <p>
                Grade {label.grade} | {label.school}
              </p>
              <p>{label.teacher ? `${label.teacher}` : "Teacher n/a"} {label.classroom ? `| Room ${label.classroom}` : ""}</p>
              <p className="mt-2 font-semibold">{label.itemName}</p>
              <p>Add: {label.additions.length ? label.additions.join(", ") : "None"}</p>
              <p>No: {label.removals.length ? label.removals.join(", ") : "None"}</p>
              <p>Order: {label.orderNumber}</p>
              <p className={label.alert ? "mt-2 rounded-md bg-rose-100 p-2 font-semibold text-rose-800" : "mt-2"}>
                Allergy: {label.alert || "None"}
              </p>
            </>
          </div>
        ))}
      </div>
    </main>
  );
}
