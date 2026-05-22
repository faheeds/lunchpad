import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";
import { PrintButton } from "@/components/admin/print-button";
import { KitchenEmailButton } from "@/components/admin/kitchen-email-button";

export const dynamic = "force-dynamic";


export const metadata: Metadata = {
  title: "Kitchen",
};
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

  // Allergen rollup: group students with allergyNotes for at-a-glance kitchen heads-up
  const allergyAlerts = orders
    .filter((o) => o.student?.allergyNotes)
    .map((o) => ({
      orderId: o.id,
      name: o.student?.studentName ?? "Unknown",
      school: o.school.name,
      classroom: o.student?.classroom ?? null,
      note: o.student?.allergyNotes ?? "",
    }));

  // Dietary-tag rollup: aggregate tags across items in this delivery
  const itemNames = [...new Set(orders.flatMap((o) => o.items.map((i) => i.itemNameSnapshot)))];
  const tagsByItem = itemNames.length > 0
    ? await prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id, name: { in: itemNames } },
        select: { name: true, dietaryTags: true },
      })
    : [];
  const tagsByItemName = new Map(tagsByItem.map((t) => [t.name, t.dietaryTags]));
  const tagCounts = new Map<string, number>();
  for (const order of orders) {
    const orderTags = new Set<string>();
    for (const item of order.items) {
      for (const tag of tagsByItemName.get(item.itemNameSnapshot) ?? []) {
        orderTags.add(tag);
      }
    }
    for (const t of orderTags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const sortedTagCounts = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

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
      <div className="space-y-4 pb-10 bg-editorial-paper min-h-screen">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3 no-print">
          <h1 className="text-[17px] font-semibold text-editorial-ink font-editorial">Kitchen Sheet</h1>
          <div className="flex items-center gap-2">
            {selectedId && restaurant.contactEmail && (
              <KitchenEmailButton
                deliveryDateId={selectedId}
                contactEmail={restaurant.contactEmail}
              />
            )}
            <PrintButton />
          </div>
        </div>

        {/* ── Delivery date selector ─────────────────────────────────── */}
        <form method="GET" className="rounded-[16px] border border-editorial-line bg-white p-3 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)] no-print">
          <label className="text-[10px] font-semibold text-editorial-ink-faint uppercase tracking-wide block mb-1.5">
            Delivery date
          </label>
          <div className="flex gap-2">
            <select
              name="deliveryDateId"
              defaultValue={selectedId ?? ""}
              className="flex-1 rounded-lg border border-editorial-line text-[13px] py-2 px-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
            >
              <option value="">Select a date…</option>
              {allDates.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE, MMM d yyyy")} — {d.school.name}
                </option>
              ))}
            </select>
            <button type="submit"
              className="px-3 py-2 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold whitespace-nowrap hover:bg-editorial-green-deep transition">
              View
            </button>
            {selectedId && (
              <Link href="/admin/kitchen" className="px-3 py-2 rounded-full border border-editorial-line text-[12px] text-editorial-ink-soft no-underline hover:border-editorial-green hover:text-editorial-green transition whitespace-nowrap">
                Clear
              </Link>
            )}
          </div>
        </form>

        {selectedDate && orders.length > 0 ? (
          <>
            {/* ── Print header (shown on print only) ────────────────── */}
            <div className="hidden print:block mb-4 print:bg-white">
              <p className="text-[18px] font-bold print:text-black">{restaurant.name} — Kitchen Sheet</p>
              <p className="text-[14px] print:text-gray-700 mt-1">{dateLabel}</p>
              <p className="text-[12px] print:text-gray-600 mt-1">Printed {new Date().toLocaleString()}</p>
            </div>

            {/* ── Allergen + dietary rollup ─────────────────────────── */}
            {(allergyAlerts.length > 0 || sortedTagCounts.length > 0) && (
              <div className="rounded-[16px] border border-[#E5D6A8] bg-[#F6EED9] shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)] overflow-hidden print:border-black/10 print:bg-white">
                <div className="px-4 py-3 border-b border-[#E5D6A8] bg-[#F6EED9]/60 flex items-center gap-2 print:border-black/10 print:bg-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#6E5C2C] print:text-black">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <p className="text-[12px] font-semibold text-[#6E5C2C] print:text-black">Heads up — allergens & dietary needs</p>
                </div>
                <div className="px-4 py-3 space-y-3 print:bg-white">
                  {allergyAlerts.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#6E5C2C] print:text-black mb-1.5">
                        {allergyAlerts.length} {allergyAlerts.length === 1 ? "person" : "people"} with allergies
                      </p>
                      <div className="space-y-1">
                        {allergyAlerts.map((a) => (
                          <div key={a.orderId} className="text-[11px] text-[#6E5C2C] print:text-black">
                            <span className="font-semibold">{a.name}</span>
                            {a.classroom && <span> · {a.classroom}</span>}
                            <span> · {a.school}</span>
                            <span> — {a.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {sortedTagCounts.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#6E5C2C] print:text-black mb-1.5">Dietary tag rollup (orders containing each tag)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sortedTagCounts.map(([tag, count]) => (
                          <span key={tag} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E5D6A8] text-[#6E5C2C] print:border-black/20 print:text-black print:bg-white">
                            {tag} · {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Item summary ───────────────────────────────────────── */}
            <div className="rounded-[16px] border border-editorial-line bg-white shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)] overflow-hidden print:shadow-none print:border-black/10">
              <div className="px-4 py-3 border-b border-editorial-line flex items-center justify-between print:border-black/10">
                <div>
                  <p className="text-[13px] font-semibold text-editorial-ink print:text-black">Item summary</p>
                  <p className="text-[11px] text-editorial-ink-faint mt-0.5 print:text-gray-600">{dateLabel}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[20px] font-bold text-editorial-ink print:text-black">{orders.length}</p>
                  <p className="text-[10px] text-editorial-ink-faint print:text-gray-600">total orders</p>
                </div>
              </div>
              <div className="divide-y divide-editorial-line print:divide-black/10">
                {sortedSummary.map(([name, qty]) => (
                  <div key={name} className="px-4 py-3 flex items-center justify-between gap-3 print:bg-white">
                    <p className="text-[13px] font-medium text-editorial-ink print:text-black">{name}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[14px] font-bold text-editorial-clay bg-[#F6EED9] rounded border border-[#E5D6A8] px-2.5 py-0.5 min-w-10 text-center print:bg-white print:border-black/20 print:text-black">
                        {qty}×
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-editorial-line bg-editorial-paper-2 flex justify-between print:border-black/10 print:bg-white">
                <p className="text-[12px] font-semibold text-editorial-ink-soft print:text-black">Total revenue</p>
                <p className="text-[12px] font-semibold text-editorial-ink print:text-black">
                  {formatCurrency(orders.reduce((s, o) => s + o.totalCents, 0))}
                </p>
              </div>
            </div>

            {/* ── Per-school order lists ─────────────────────────────── */}
            {[...bySchool.values()].map(({ schoolName, orders: schoolOrders }, si) => (
              <div key={schoolName} className={`rounded-[16px] border border-editorial-line bg-white shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)] overflow-hidden ${si > 0 ? "print:break-before-page" : ""} print:shadow-none print:border-black/10`}>
                <div className="px-4 py-3 border-b border-editorial-line flex items-center justify-between bg-editorial-green-deep print:border-black/10 print:bg-white">
                  <div>
                    <p className="text-[13px] font-semibold text-white print:text-black">{schoolName}</p>
                    <p className="text-[11px] text-white/60 print:text-gray-600">{dateLabel}</p>
                  </div>
                  <div className="bg-editorial-clay text-white rounded px-3 py-1 text-[14px] font-bold print:bg-white print:text-black print:border print:border-black/10">
                    {schoolOrders.length}
                  </div>
                </div>

                <div className="divide-y divide-editorial-line print:divide-black/10">
                  {schoolOrders.map((order, i) => (
                    <div key={order.id} className="px-4 py-3 print:bg-white">
                      <div className="flex items-start gap-3">
                        {/* Row number */}
                        <div className="w-5 h-5 rounded-full flex-shrink-0 bg-editorial-paper-2 flex items-center justify-center text-[10px] font-bold text-editorial-ink-soft mt-0.5 print:bg-white print:border print:border-black/20 print:text-black">
                          {i + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Student info */}
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-[13px] font-semibold text-editorial-ink print:text-black">{order.student?.studentName ?? "Unknown"}</p>
                            {order.student?.grade && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-editorial-sage text-editorial-green print:bg-white print:border print:border-black/20 print:text-black">
                                Gr {order.student.grade}
                              </span>
                            )}
                            {order.student?.classroom && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-editorial-paper-2 text-editorial-ink-soft print:bg-white print:border print:border-black/20 print:text-black">
                                Room {order.student.classroom}
                              </span>
                            )}
                            {order.student?.teacherName && (
                              <span className="text-[10px] text-editorial-ink-soft print:text-gray-600">
                                {order.student.teacherName}
                              </span>
                            )}
                            {order.student?.allergyNotes && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F4E3DB] border border-[#E2C3B3] text-[#7C3D24] print:bg-white print:border-black/20 print:text-black">
                                ⚠ {order.student.allergyNotes}
                              </span>
                            )}
                          </div>

                          {/* Items */}
                          {order.items.map((item) => (
                            <div key={item.id} className="mb-1">
                              <p className="text-[12px] font-medium text-editorial-ink print:text-black">{item.itemNameSnapshot}</p>
                              {(item.additions.length > 0 || item.removals.length > 0) && (
                                <p className="text-[11px] text-editorial-ink-soft print:text-gray-600">
                                  {[
                                    ...item.additions.map((a) => `+ ${a}`),
                                    ...item.removals.map((r) => `− ${r}`),
                                  ].join(" · ")}
                                </p>
                              )}
                              {item.specialInstructions && (
                                <p className="text-[11px] text-editorial-clay font-medium print:text-black">Note: {item.specialInstructions}</p>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="text-right flex-shrink-0">
                          <p className="text-[12px] font-semibold text-editorial-ink print:text-black">{formatCurrency(order.totalCents)}</p>
                          <p className="text-[10px] text-editorial-ink-faint mt-0.5 print:text-gray-600">#{order.orderNumber ?? order.id.slice(-6)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* School subtotal */}
                <div className="px-4 py-3 border-t border-editorial-line bg-editorial-paper-2 flex justify-between print:border-black/10 print:bg-white">
                  <p className="text-[12px] font-semibold text-editorial-ink-soft print:text-black">{schoolName} subtotal</p>
                  <p className="text-[12px] font-semibold text-editorial-ink print:text-black">
                    {formatCurrency(schoolOrders.reduce((s, o) => s + o.totalCents, 0))}
                  </p>
                </div>
              </div>
            ))}
          </>
        ) : selectedDate ? (
          <div className="rounded-[16px] border border-editorial-line bg-white px-4 py-10 text-center shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-editorial-ink-faint">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <p className="text-[13px] font-medium text-editorial-ink-soft">No paid orders for this date.</p>
          </div>
        ) : (
          <div className="rounded-[16px] border border-editorial-line bg-white px-4 py-10 text-center shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
            <p className="text-[13px] font-medium text-editorial-ink-soft">Select a delivery date above to generate the kitchen sheet.</p>
          </div>
        )}
      </div>
    </>
  );
}
