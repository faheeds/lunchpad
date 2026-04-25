import Link from "next/link";
import { prisma } from "@/lib/db";
import { listOrders } from "@/lib/orders";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { OrdersList } from "@/components/admin/orders-list";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

function normalizeMultiValue(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams: Promise<{ deliveryDateId?: string; schoolIds?: string | string[]; status?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const selectedSchoolIds = normalizeMultiValue(params.schoolIds);

  const [orders, schools, allDeliveryDates] = await Promise.all([
    listOrders({ deliveryDateId: params.deliveryDateId, schoolIds: selectedSchoolIds, status: params.status, archived: params.archived }),
    prisma.school.findMany({ where: { isActive: true, slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }, orderBy: { name: "asc" } }),
    prisma.deliveryDate.findMany({
      where: { school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }, schoolId: selectedSchoolIds.length ? { in: selectedSchoolIds } : undefined },
      include: { school: true },
      orderBy: { deliveryDate: "asc" }
    })
  ]);

  // Deduplicate dates — when no school filter, show each calendar date once
  const seenDates = new Set<string>();
  const deliveryDates = allDeliveryDates.filter((d) => {
    const label = formatInTimeZone(d.deliveryDate, d.school.timezone, "yyyy-MM-dd");
    if (seenDates.has(label)) return false;
    seenDates.add(label);
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[17px] font-semibold text-ink">Orders</h1>
        <div className="flex gap-2">
          <a href={`/api/admin/export${params.deliveryDateId ? `?deliveryDateId=${params.deliveryDateId}` : ""}`}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] text-slate-600 no-underline">CSV</a>
          <a href={`/api/admin/labels${params.deliveryDateId ? `?deliveryDateId=${params.deliveryDateId}` : ""}`}
            target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] text-slate-600 no-underline">Labels PDF</a>
          <Link href={`/admin/orders/labels-print${params.deliveryDateId ? `?deliveryDateId=${params.deliveryDateId}` : ""}`}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] text-slate-600 no-underline">Print</Link>
        </div>
      </div>

      <form className="rounded-[14px] border border-slate-100 bg-white p-3">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select name="schoolIds" multiple defaultValue={selectedSchoolIds}
            className="rounded-lg border-slate-200 text-[12px] py-1.5 min-h-[56px]">
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="flex flex-col gap-2">
            <select name="deliveryDateId" defaultValue={params.deliveryDateId ?? ""}
              className="rounded-lg border-slate-200 text-[12px] py-1.5">
              <option value="">All dates</option>
              {deliveryDates.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE MMM d")}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={params.status ?? "ALL"}
              className="rounded-lg border-slate-200 text-[12px] py-1.5">
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select name="archived" defaultValue={params.archived ?? "exclude"}
              className="rounded-lg border-slate-200 text-[12px] py-1.5">
              <option value="exclude">Active only</option>
              <option value="include">Active + archived</option>
              <option value="only">Archived only</option>
            </select>
          </div>
        </div>
        <button type="submit"
          className="w-full py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
          Apply filters
        </button>
      </form>

      <OrdersList orders={orders} />
    </div>
  );
}
