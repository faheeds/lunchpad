import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KitchenSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ deliveryDateId?: string }>;
}) {
  const [params, restaurant] = await Promise.all([
    searchParams,
    requireRestaurant(),
    requireAdminRole("MANAGER"),
  ]);

  // Load all upcoming + recent delivery dates for the selector
  const allDates = await prisma.deliveryDate.findMany({
    where: { school: { restaurantId: restaurant.id } },
    include: { school: true },
    orderBy: { deliveryDate: "desc" },
    take: 60,
  });

  const selectedId = params.deliveryDateId ?? allDates[0]?.id ?? null;
  const selectedDate = allDates.find((d) => d.id === selectedId) ?? null;

  // Load orders for selected date
  const orders = selectedId
    ? await prisma.order.findMany({
        where: {
          deliveryDateId: selectedId,
          status: "PAID",
          archivedAt: null,
        },
        include: {
          student: true,
          school: true,
          deliveryDate: { include: { school: true } },
          items: {
            orderBy: { itemNameSnapshot: "asc" },
          },
        },
        orderBy: [{ school: { name: "asc" } }, { student: { studentName: "asc" } }],
      })
    : [];

  // Build item summary (quantity per item)
  const itemSummary = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      itemSummary.set(item.itemNameSnapshot, (itemSummary.get(item.itemNameSnapshot) ?? 0) + 1);
    }
  }
  const sortedSummary = [...itemSummary.entries()].sort((a, b) => b[1] - a[1]);

  // Group orders by school
  const bySchool = new Map<string, { schoolName: string; orders: typeof orders }>();
  for (const order of orders) {
    const key = order.schoolId;
    if (!bySchool.has(key)) bySchool.set(key, { schoolName: order.school.name, orders: [] });
    bySchool.get(key)!.orders.push(order);
  }

  const tz = selectedDate?.school.timezone ?? "America/Los_Angeles";
  const dateLabel = selectedDate
    ? formatInTimeZone(selectedDate.deliveryDate, tz, "EEEE, MMMM d yyyy")
    : "—";

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          body { font-size: 12px; }
        }
      `}</style>

      <div className="space-y-5 pb-10">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3 no-print">
          <h1 className="text-[17px] font-semibold text-ink">Kitchen Sheet</h1>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
        </div>

        {/* ── Delivery date selector ─────────────────────────────────── */}
        <form className="rounded-[14px] border border-slate-100 bg-white p-3 no-print">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
            Delivery date
          </label>
          <div className="flex gap-2">
            <select
              name="deliveryDateId"
              defaultValue={selectedId ?? ""}
              className="flex-1 rounded-lg border-slate-200 text-[13px] py-2 px-2"
              onChange={(e) => {
                const url = new URL(window.location.href);
                url.searchParams.set("deliveryDateId", e.target.value);
                window.location.href = url.toString();
              }}
            >
              <option value="">Select a date…</option>
              {allDates.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE, MMM d yyyy")} — {d.school.name}
                </option>
              ))}
            </select>
            {selectedId && (
              <Link href="/admin/kitchen" className="px-3 py-2 rounded-lg border border-slate-200 text-[12px] text-slate-500 no-underline hover:bg-slate-50 transition whitespace-nowrap">
                Clear
              </Link>
            )}
          </div>
        </form>

        {selectedDate && orders.length > 0 ? (
          <>
            {/* ── Print header (shown on print only) ────────────────── */}
            <div className="hidden print:block mb-4">
              <p className="text-[18px] font-bold">{restaurant.name} — Kitchen Sheet</p>
              <p className="text-[14px] text-gray-600">{dateLabel}</p>
              <p className="text-[12px] text-gray-400 mt-1">Printed {new Date().toLocaleString()}</p>
            </div>

            {/* ── Item summary ───────────────────────────────────────── */}
            <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-ink">Item summary</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{dateLabel}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[20px] font-bold text-ink">{orders.length}</p>
                  <p className="text-[10px] text-slate-400">total orders</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {sortedSummary.map(([name, qty]) => (
                  <div key={name} className="px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium text-ink">{name}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span style={{
                        fontSize: 14, fontWeight: 800, color: "#c41230",
                        background: "#fff1f3", borderRadius: 8,
                        padding: "3px 10px", minWidth: 36, textAlign: "center",
                      }}>
                        {qty}×
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-slate-50 bg-slate-50/50 flex justify-between">
                <p className="text-[12px] font-semibold text-slate-600">Total revenue</p>
                <p className="text-[12px] font-semibold text-ink">
                  {formatCurrency(orders.reduce((s, o) => s + o.totalCents, 0))}
                </p>
              </div>
            </div>

            {/* ── Per-school order lists ─────────────────────────────── */}
            {[...bySchool.values()].map(({ schoolName, orders: schoolOrders }, si) => (
              <div key={schoolName} className={`rounded-[14px] border border-slate-100 bg-white overflow-hidden ${si > 0 ? "print-break" : ""}`}>
                <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between"
                  style={{ background: "linear-gradient(135deg, #0f1923 0%, #1a2d42 100%)" }}>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{schoolName}</p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>{dateLabel}</p>
                  </div>
                  <div style={{
                    background: "#c41230", borderRadius: 8,
                    padding: "4px 12px", fontSize: 14, fontWeight: 800, color: "white",
                  }}>
                    {schoolOrders.length}
                  </div>
                </div>

                <div className="divide-y divide-slate-50">
                  {schoolOrders.map((order, i) => (
                    <div key={order.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {/* Row number */}
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          background: "#f1f5f9", display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#94a3b8",
                          marginTop: 1,
                        }}>
                          {i + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Student info */}
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-[13px] font-semibold text-ink">{order.student?.studentName ?? "Unknown"}</p>
                            {order.student?.grade && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#0369a1", background: "#eff6ff", borderRadius: 100, padding: "1px 7px" }}>
                                Gr {order.student.grade}
                              </span>
                            )}
                            {order.student?.classroom && (
                              <span style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", borderRadius: 100, padding: "1px 7px" }}>
                                Room {order.student.classroom}
                              </span>
                            )}
                            {order.student?.teacherName && (
                              <span style={{ fontSize: 10, color: "#6b7280" }}>
                                {order.student.teacherName}
                              </span>
                            )}
                            {order.student?.allergyNotes && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", borderRadius: 100, padding: "1px 8px" }}>
                                ⚠ {order.student.allergyNotes}
                              </span>
                            )}
                          </div>

                          {/* Items */}
                          {order.items.map((item) => (
                            <div key={item.id} className="mb-1">
                              <p className="text-[12px] font-medium text-ink">{item.itemNameSnapshot}</p>
                              {(item.additions.length > 0 || item.removals.length > 0) && (
                                <p className="text-[11px] text-slate-500">
                                  {[
                                    ...item.additions.map((a) => `+ ${a}`),
                                    ...item.removals.map((r) => `− ${r}`),
                                  ].join(" · ")}
                                </p>
                              )}
                              {item.specialInstructions && (
                                <p className="text-[11px] text-amber-700 font-medium">Note: {item.specialInstructions}</p>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="text-right flex-shrink-0">
                          <p className="text-[12px] font-semibold text-ink">{formatCurrency(order.totalCents)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">#{order.orderNumber ?? order.id.slice(-6)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* School subtotal */}
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between">
                  <p className="text-[12px] font-semibold text-slate-600">{schoolName} subtotal</p>
                  <p className="text-[12px] font-semibold text-ink">
                    {formatCurrency(schoolOrders.reduce((s, o) => s + o.totalCents, 0))}
                  </p>
                </div>
              </div>
            ))}
          </>
        ) : selectedDate ? (
          <div className="rounded-[14px] border border-slate-100 bg-white px-4 py-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <p className="text-[13px] font-medium text-slate-400">No paid orders for this date.</p>
          </div>
        ) : (
          <div className="rounded-[14px] border border-slate-100 bg-white px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-slate-400">Select a delivery date above to generate the kitchen sheet.</p>
          </div>
        )}
      </div>
    </>
  );
}
