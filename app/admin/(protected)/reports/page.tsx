import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAdminReports } from "@/lib/admin";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { formatCurrency } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { ReportsCharts } from "@/components/admin/reports-charts";

export const dynamic = "force-dynamic";

function normalizeMultiValue(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    schoolIds?: string | string[];
    deliveryDateId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const [params, restaurant] = await Promise.all([
    searchParams,
    requireRestaurant(),
    requireAdminRole("MANAGER"),
  ]);

  const selectedSchoolIds = normalizeMultiValue(params.schoolIds);

  const [schools, allDeliveryDates, reports] = await Promise.all([
    prisma.school.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.deliveryDate.findMany({
      where: {
        school: { restaurantId: restaurant.id },
        schoolId: selectedSchoolIds.length ? { in: selectedSchoolIds } : undefined,
      },
      include: { school: true },
      orderBy: { deliveryDate: "desc" },
    }),
    getAdminReports(restaurant.id, {
      schoolIds: selectedSchoolIds,
      deliveryDateId: params.deliveryDateId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    }),
  ]);

  // Deduplicate delivery dates by calendar day
  const seen = new Set<string>();
  const deliveryDates = allDeliveryDates.filter((d) => {
    const k = formatInTimeZone(d.deliveryDate, d.school.timezone, "yyyy-MM-dd");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Per-delivery-date breakdown from the orders already fetched in getAdminReports
  // We need raw orders for this — re-query scoped to date range
  const { dateBreakdown, revenueSeries } = await (async () => {
    const { OrderStatus } = await import("@prisma/client");
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        status: OrderStatus.PAID,
        archivedAt: null,
        deliveryDateId: params.deliveryDateId || undefined,
        schoolId: selectedSchoolIds.length ? { in: selectedSchoolIds } : undefined,
      },
      include: { deliveryDate: { include: { school: true } }, items: true },
      orderBy: { deliveryDate: { deliveryDate: "desc" } },
    });

    const map = new Map<string, {
      dateLabel: string; schoolName: string; orders: number; items: number; revenue: number; sortKey: number;
    }>();
    for (const order of orders) {
      const key = order.deliveryDateId;
      const tz  = order.deliveryDate.school.timezone;
      const existing = map.get(key) ?? {
        dateLabel: formatInTimeZone(order.deliveryDate.deliveryDate, tz, "EEE, MMM d yyyy"),
        schoolName: order.deliveryDate.school.name,
        orders: 0, items: 0, revenue: 0,
        sortKey: order.deliveryDate.deliveryDate.getTime(),
      };
      existing.orders  += 1;
      existing.items   += order.items.length;
      existing.revenue += order.totalCents;
      map.set(key, existing);
    }
    const all = [...map.values()];
    return {
      dateBreakdown: all.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 20),
      revenueSeries: all
        .slice()
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(-30)
        .map((d) => ({
          date: formatInTimeZone(new Date(d.sortKey), "UTC", "MMM d"),
          revenue: d.revenue,
          orders: d.orders,
        })),
    };
  })();

  const topItemsSeries = reports.itemBreakdown.slice(0, 8).map((i) => ({
    name: i.itemName.length > 14 ? i.itemName.slice(0, 14) + "…" : i.itemName,
    quantity: i.quantity,
  }));

  // Build CSV export URL
  const csvParams = new URLSearchParams();
  if (params.deliveryDateId) csvParams.set("deliveryDateId", params.deliveryDateId);
  if (params.dateFrom)       csvParams.set("dateFrom", params.dateFrom);
  if (params.dateTo)         csvParams.set("dateTo", params.dateTo);
  selectedSchoolIds.forEach((id) => csvParams.append("schoolIds", id));
  const csvUrl = `/api/admin/export${csvParams.toString() ? `?${csvParams}` : ""}`;

  const avgOrderValue = reports.totals.totalOrders > 0
    ? Math.round(reports.totals.totalSalesCents / reports.totals.totalOrders)
    : 0;

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-[17px] font-semibold text-ink">Reports</h1>
        <a href={csvUrl} download
          className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] font-medium text-slate-600 no-underline hover:bg-slate-50 transition flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </a>
      </div>

      {/* ── Filter bar ───────────────────────────────────────���─────── */}
      <form className="rounded-[14px] border border-slate-100 bg-white p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">School</label>
            <select name="schoolIds" defaultValue={selectedSchoolIds[0] ?? ""}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
              <option value="">All schools</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Delivery date</label>
            <select name="deliveryDateId" defaultValue={params.deliveryDateId ?? ""}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
              <option value="">All dates</option>
              {deliveryDates.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE MMM d")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Date range</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" name="dateFrom" defaultValue={params.dateFrom ?? ""}
              className="rounded-lg border-slate-200 text-[12px] px-2 py-1.5" placeholder="From" />
            <input type="date" name="dateTo" defaultValue={params.dateTo ?? ""}
              className="rounded-lg border-slate-200 text-[12px] px-2 py-1.5" placeholder="To" />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
            Apply filters
          </button>
          <Link href="/admin/reports"
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-[12px] font-medium no-underline hover:bg-slate-50 transition whitespace-nowrap">
            Clear
          </Link>
        </div>
      </form>

      {/* ── Summary tiles ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: "Revenue",     value: formatCurrency(reports.totals.totalSalesCents), sub: "paid orders",  color: "#c41230", bg: "#fff1f3", border: "#fecdd3" },
          { label: "Orders",      value: String(reports.totals.totalOrders),             sub: "paid orders",  color: "#0369a1", bg: "#eff6ff", border: "#bfdbfe" },
          { label: "Items sold",  value: String(reports.totals.totalItemsSold),          sub: "line items",   color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
          { label: "Avg order",   value: formatCurrency(avgOrderValue),                  sub: "per order",    color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
        ] as const).map(({ label, value, sub, color, bg, border }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "12px 14px", minHeight: 80 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1, whiteSpace: "nowrap" }}>{value}</p>
            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <ReportsCharts revenue={revenueSeries} topItems={topItemsSeries} />

      {/* ── Two-up on desktop: by-date + by-school side by side ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── By delivery date ───────────────────────────────────────── */}
      {dateBreakdown.length > 0 && (
        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">By delivery date</p>
            <p className="text-[11px] text-slate-400">{dateBreakdown.length} dates</p>
          </div>
          <div className="divide-y divide-slate-50">
            {dateBreakdown.map((row, i) => {
              const pct = reports.totals.totalSalesCents > 0
                ? (row.revenue / reports.totals.totalSalesCents) * 100
                : 0;
              return (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-ink truncate">{row.dateLabel}</p>
                      <p className="text-[11px] text-slate-400">{row.schoolName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[13px] font-semibold text-ink">{formatCurrency(row.revenue)}</p>
                      <p className="text-[10px] text-slate-400">{row.orders} orders · {row.items} items</p>
                    </div>
                  </div>
                  {/* Revenue bar */}
                  <div style={{ height: 4, background: "#f1f5f9", borderRadius: 100, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 100,
                      width: `${Math.max(2, pct)}%`,
                      background: "linear-gradient(90deg, #c41230, #ef4444)",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── By school ──────────────────────────────────────────────── */}
      {reports.schoolBreakdown.length > 0 && (
        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[13px] font-semibold text-ink">By school</p>
          </div>
          <div className="divide-y divide-slate-50">
            {reports.schoolBreakdown.map((school) => (
              <div key={school.schoolId} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{school.schoolName}</p>
                  <p className="text-[11px] text-slate-400">
                    {school.orders} order{school.orders !== 1 ? "s" : ""} · {school.itemsSold} items
                  </p>
                </div>
                <p className="text-[14px] font-semibold text-ink flex-shrink-0">
                  {formatCurrency(school.salesCents)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* ── Menu item performance ───────────────────────────────────── */}
      {reports.itemBreakdown.length > 0 && (
        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">Menu item performance</p>
            <p className="text-[11px] text-slate-400">ranked by quantity</p>
          </div>
          <div className="divide-y divide-slate-50">
            {reports.itemBreakdown.map((item, i) => {
              const maxQty = reports.itemBreakdown[0]?.quantity ?? 1;
              const pct    = (item.quantity / maxQty) * 100;
              return (
                <div key={item.itemName} className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-1.5">
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: i === 0 ? "#fff1f3" : "#f3f4f6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                      color: i === 0 ? "#c41230" : "#9ca3af",
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate">{item.itemName}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {Object.entries(item.bySchool)
                          .map(([s, c]) => `${s}: ${c}`)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[13px] font-semibold text-ink">{item.quantity}×</p>
                      <p className="text-[11px] text-brand-700">{formatCurrency(item.salesCents)}</p>
                    </div>
                  </div>
                  <div style={{ height: 3, background: "#f1f5f9", borderRadius: 100, overflow: "hidden", marginLeft: 36 }}>
                    <div style={{
                      height: "100%", borderRadius: 100,
                      width: `${Math.max(2, pct)}%`,
                      background: i === 0 ? "linear-gradient(90deg, #c41230, #ef4444)" : "#e2e8f0",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {reports.totals.totalOrders === 0 && (
        <div className="rounded-[14px] border border-slate-100 bg-white px-4 py-10 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <p className="text-[13px] font-medium text-slate-400">No paid orders match the current filters.</p>
          <p className="text-[11px] text-slate-300 mt-1">Try widening the date range or clearing filters.</p>
        </div>
      )}
    </div>
  );
}
