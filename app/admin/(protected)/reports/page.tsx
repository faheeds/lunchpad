import { prisma } from "@/lib/db";
import { getAdminReports } from "@/lib/admin";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { formatCurrency } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

function normalizeMultiValue(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export default async function AdminReportsPage({
  searchParams
}: {
  searchParams: Promise<{ schoolIds?: string | string[]; deliveryDateId?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const params = await searchParams;
  const selectedSchoolIds = normalizeMultiValue(params.schoolIds);

  const [schools, allDeliveryDates, reports] = await Promise.all([
    prisma.school.findMany({ where: { isActive: true, slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }, orderBy: { name: "asc" } }),
    prisma.deliveryDate.findMany({
      where: { school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }, schoolId: selectedSchoolIds.length ? { in: selectedSchoolIds } : undefined },
      include: { school: true },
      orderBy: { deliveryDate: "asc" }
    }),
    getAdminReports({ schoolIds: selectedSchoolIds, deliveryDateId: params.deliveryDateId, dateFrom: params.dateFrom, dateTo: params.dateTo })
  ]);

  // Deduplicate dates
  const seen = new Set<string>();
  const deliveryDates = allDeliveryDates.filter((d) => {
    const k = formatInTimeZone(d.deliveryDate, d.school.timezone, "yyyy-MM-dd");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const totals = [
    { label: "Paid orders", value: reports.totals.totalOrders, prefix: "" },
    { label: "Items sold", value: reports.totals.totalItemsSold, prefix: "" },
    { label: "Revenue", value: formatCurrency(reports.totals.totalSalesCents), prefix: "" },
  ];

  return (
    <div className="space-y-4 pb-10">
      <h1 className="text-[17px] font-semibold text-ink">Reports</h1>

      {/* Filter */}
      <form className="rounded-[14px] border border-slate-100 bg-white p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 block">School</label>
            <select name="schoolIds" multiple defaultValue={selectedSchoolIds}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 min-h-[56px]">
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 block">Delivery date</label>
              <select name="deliveryDateId" defaultValue={params.deliveryDateId ?? ""}
                className="w-full rounded-lg border-slate-200 text-[12px] py-1.5">
                <option value="">All dates</option>
                {deliveryDates.map((d) => (
                  <option key={d.id} value={d.id}>{formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE MMM d")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 block">Date range</label>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="date" name="dateFrom" defaultValue={params.dateFrom ?? ""}
                  className="rounded-lg border-slate-200 text-[11px] px-2 py-1.5" />
                <input type="date" name="dateTo" defaultValue={params.dateTo ?? ""}
                  className="rounded-lg border-slate-200 text-[11px] px-2 py-1.5" />
              </div>
            </div>
          </div>
        </div>
        <button type="submit" className="w-full py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
          Apply filters
        </button>
      </form>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        {totals.map(({ label, value }) => (
          <div key={label} className="rounded-[14px] bg-white border border-slate-100 p-3 text-center">
            <p className="text-[20px] font-semibold text-ink">{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* School breakdown */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">By school</p>
        </div>
        {reports.schoolBreakdown.length ? (
          <div className="divide-y divide-slate-50">
            {reports.schoolBreakdown.map((school) => (
              <div key={school.schoolId} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{school.schoolName}</p>
                  <p className="text-[11px] text-slate-500">{school.orders} orders &middot; {school.itemsSold} items</p>
                </div>
                <p className="text-[14px] font-semibold text-ink flex-shrink-0">{formatCurrency(school.salesCents)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-4 text-[12px] text-slate-400">No data for current filters.</p>
        )}
      </div>

      {/* Item performance */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Menu item performance</p>
        </div>
        {reports.itemBreakdown.length ? (
          <div className="divide-y divide-slate-50">
            {reports.itemBreakdown.map((item, i) => (
              <div key={item.itemName} className="px-4 py-3 flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-500 flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{item.itemName}</p>
                  <p className="text-[11px] text-slate-500">
                    {Object.entries(item.bySchool).map(([school, count]) => `${school.replace("Medina Academy ", "")}: ${count}`).join(" · ")}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[13px] font-semibold text-ink">{item.quantity}×</p>
                  <p className="text-[11px] text-brand-700">{formatCurrency(item.salesCents)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-4 text-[12px] text-slate-400">No item sales for current filters.</p>
        )}
      </div>
    </div>
  );
}
