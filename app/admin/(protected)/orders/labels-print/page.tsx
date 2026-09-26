import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { mapOrderToLabelRows } from "@/lib/pdf/labels";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print Labels",
};

export default async function LabelsPrintPage({
  searchParams
}: {
  searchParams: Promise<{
    deliveryDateId?: string;
    orderIds?: string;
    schoolId?: string;
    status?: string;
    archived?: string;
    fromDate?: string;
    toDate?: string;
    q?: string;
  }>;
}) {
  await requireAdminRole("STAFF");
  const restaurant = await requireRestaurant();
  const params = await searchParams;

  let orders;

  if (params.orderIds) {
    // Explicit selection (bulk "Print labels" on hand-picked rows) overrides
    // every other filter -- the operator chose these orders directly.
    const orderIds = params.orderIds
      .split(",")
      .filter((id) => id.trim())
      .slice(0, 1000);

    orders = orderIds.length > 0
      ? await prisma.order.findMany({
          where: { restaurantId: restaurant.id, id: { in: orderIds } },
          include: { school: true, deliveryDate: true, student: true, items: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
  } else {
    // Same filters the orders list and CSV export use (fromDate/toDate,
    // deliveryDateId, schoolId, status, archived, search). Previously this
    // page only ever looked at deliveryDateId, so filtering the orders list
    // by a date range (without ALSO picking one exact date from the
    // separate "Delivery date" dropdown) had no effect on this print view --
    // it silently printed every paid order for the restaurant.
    orders = await listOrders({
      restaurantId: restaurant.id,
      deliveryDateId: params.deliveryDateId,
      schoolId: params.schoolId,
      // Labels are for kitchen prep, so default to PAID-only (matches the
      // previous hardcoded behavior) unless the operator explicitly chose
      // a different status filter on the orders list.
      status: params.status ?? "PAID",
      archived: params.archived ?? "exclude",
      fromDate: params.fromDate,
      toDate: params.toDate,
      search: params.q,
    });
  }

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
