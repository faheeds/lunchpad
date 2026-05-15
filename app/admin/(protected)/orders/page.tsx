import Link from "next/link";
import { prisma } from "@/lib/db";
import { listOrders } from "@/lib/orders";
import { requireRestaurant } from "@/lib/restaurant";
import { OrdersList } from "@/components/admin/orders-list";
import { EmptyState } from "@/components/admin/empty-state";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";
import { auth } from "@/lib/auth";
import type { AdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Returns a query-string with one parameter removed — used by the active
 * filter chips so each chip's "x" link points to "the same URL minus this
 * filter." Operating on a clone keeps the source URLSearchParams safe to
 * reuse for other things (CSV export, labels, etc.).
 */
function stripParam(base: URLSearchParams, key: string): string {
  const next = new URLSearchParams(base);
  next.delete(key);
  const qs = next.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

type OrderSortKey = "delivery-asc" | "delivery-desc" | "created-desc" | "amount-desc" | "amount-asc";

const SORT_OPTIONS: { value: OrderSortKey; label: string }[] = [
  { value: "delivery-asc",  label: "Delivery date — earliest first" },
  { value: "delivery-desc", label: "Delivery date — latest first" },
  { value: "created-desc",  label: "Newest first (placed)" },
  { value: "amount-desc",   label: "Amount — highest" },
  { value: "amount-asc",    label: "Amount — lowest" },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    deliveryDateId?: string;
    schoolId?: string;
    status?: string;
    archived?: string;
    q?: string;
    fromDate?: string;
    toDate?: string;
    sort?: string;
  }>;
}) {
  const [params, restaurant, session] = await Promise.all([searchParams, requireRestaurant(), auth()]);
  // Used to gate destructive bulk actions (cancel/refund) on the client
  // side so STAFF don't see buttons they can't actually click.
  const myRole = ((session?.user as { adminRole?: AdminRole } | undefined)?.adminRole ?? "STAFF") as AdminRole;

  const sortKey: OrderSortKey =
    SORT_OPTIONS.some((o) => o.value === params.sort)
      ? (params.sort as OrderSortKey)
      : "delivery-asc";

  const [orders, schools, allDeliveryDates] = await Promise.all([
    listOrders({
      restaurantId: restaurant.id,
      deliveryDateId: params.deliveryDateId,
      schoolIds: params.schoolId ? [params.schoolId] : [],
      status: params.status,
      archived: params.archived,
      search: params.q,
      fromDate: params.fromDate,
      toDate: params.toDate,
      sort: sortKey,
    }),
    prisma.school.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.deliveryDate.findMany({
      where: { school: { restaurantId: restaurant.id } },
      include: { school: true },
      orderBy: { deliveryDate: "desc" },
      take: 60,
    }),
  ]);

  // Deduplicate delivery dates by calendar day
  const seenDates = new Set<string>();
  const deliveryDates = allDeliveryDates.filter((d) => {
    const label = formatInTimeZone(d.deliveryDate, d.school.timezone, "yyyy-MM-dd");
    if (seenDates.has(label)) return false;
    seenDates.add(label);
    return true;
  });

  // Summary stats from returned orders
  const paidOrders    = orders.filter((o) => o.status === "PAID");
  const pendingOrders = orders.filter((o) => o.status === "PENDING");
  const revenue       = paidOrders.reduce((sum, o) => sum + o.totalCents, 0);

  const exportParams = new URLSearchParams();
  if (params.deliveryDateId) exportParams.set("deliveryDateId", params.deliveryDateId);
  if (params.schoolId) exportParams.set("schoolId", params.schoolId);
  if (params.status && params.status !== "ALL") exportParams.set("status", params.status);
  if (params.archived) exportParams.set("archived", params.archived);
  if (params.fromDate) exportParams.set("fromDate", params.fromDate);
  if (params.toDate) exportParams.set("toDate", params.toDate);
  if (params.q) exportParams.set("q", params.q);
  const exportBase = exportParams.toString() ? `?${exportParams.toString()}` : "";

  // Detect "any filter active" so the Clear button only renders when there's
  // something to clear, and so we can show a chip strip summarizing the
  // active filter set above the form.
  const activeFilterChips: { label: string; href: string }[] = [];
  if (params.q) activeFilterChips.push({ label: `"${params.q}"`, href: stripParam(exportParams, "q") });
  if (params.schoolId) {
    const s = schools.find((x) => x.id === params.schoolId);
    if (s) activeFilterChips.push({ label: s.name, href: stripParam(exportParams, "schoolId") });
  }
  if (params.deliveryDateId) {
    const d = allDeliveryDates.find((x) => x.id === params.deliveryDateId);
    if (d) activeFilterChips.push({
      label: formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE, MMM d"),
      href: stripParam(exportParams, "deliveryDateId"),
    });
  }
  if (params.fromDate) activeFilterChips.push({ label: `From ${params.fromDate}`, href: stripParam(exportParams, "fromDate") });
  if (params.toDate) activeFilterChips.push({ label: `Through ${params.toDate}`, href: stripParam(exportParams, "toDate") });
  if (params.status && params.status !== "ALL") activeFilterChips.push({ label: params.status, href: stripParam(exportParams, "status") });
  if (params.archived === "only") activeFilterChips.push({ label: "Archived only", href: stripParam(exportParams, "archived") });
  if (params.archived === "include") activeFilterChips.push({ label: "Inc. archived", href: stripParam(exportParams, "archived") });
  if (sortKey !== "delivery-asc") activeFilterChips.push({
    label: `Sort: ${SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? sortKey}`,
    href: stripParam(exportParams, "sort"),
  });

  return (
    <div className="space-y-4 pb-10">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[17px] font-semibold text-ink">Orders</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {orders.length} order{orders.length !== 1 ? "s" : ""} match current filters
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/orders/new"
            className="px-3 py-1.5 rounded-full bg-brand-700 text-white text-[11px] font-semibold no-underline hover:bg-brand-800 transition flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New order
          </Link>
          <a href={`/api/admin/export${exportBase}`}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] font-medium text-slate-600 no-underline hover:bg-slate-50 transition flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            CSV
          </a>
          <a href={`/api/admin/labels${exportBase}`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] font-medium text-slate-600 no-underline hover:bg-slate-50 transition flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Labels PDF
          </a>
          <Link href={`/admin/orders/labels-print${exportBase}`}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] font-medium text-slate-600 no-underline hover:bg-slate-50 transition flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </Link>
        </div>
      </div>

      {/* ── Stat tiles ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: "Total",    sub: "shown",      value: String(orders.length),         color: "#0f1923", bg: "#f8fafc", border: "#e2e8f0" },
          { label: "Paid",     sub: "orders",     value: String(paidOrders.length),     color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
          { label: "Pending",  sub: "orders",     value: String(pendingOrders.length),  color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
          { label: "Revenue",  sub: "from paid",  value: formatCurrency(revenue),       color: "#c41230", bg: "#fff1f3", border: "#fecdd3" },
        ] as const).map(({ label, sub, value, color, bg, border }) => (
          <div key={label} style={{
            background: bg, border: `1px solid ${border}`, borderRadius: 14,
            padding: "12px 14px", minHeight: 80,
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              {label}
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1, whiteSpace: "nowrap" }}>
              {value}
            </p>
            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Active filter chips — let operators see at a glance what's
          narrowing the result set, with a 1-click way to drop any one
          filter without clearing the whole form. */}
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            Active filters:
          </span>
          {activeFilterChips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 transition px-2.5 py-1 text-[11px] font-medium text-slate-700 no-underline"
            >
              {chip.label}
              <span aria-hidden="true" className="text-slate-400 hover:text-slate-700">×</span>
            </Link>
          ))}
          <Link
            href="/admin/orders"
            className="text-[11px] text-slate-500 underline-offset-2 hover:underline"
          >
            Clear all
          </Link>
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <form className="rounded-[14px] border border-slate-100 bg-white p-3">
        <div className="mb-2">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Search</label>
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Name, email, order #, school, or item…"
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 pl-8 pr-3"
            />
          </div>
        </div>

        {/* Date range — operators looking at a week or month of orders need
            a span, not just a single calendar day. fromDate/toDate are
            inclusive on both ends. The single-date dropdown below still
            works for picking one specific delivery date. */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">From date</label>
            <input
              type="date"
              name="fromDate"
              defaultValue={params.fromDate ?? ""}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Through date</label>
            <input
              type="date"
              name="toDate"
              defaultValue={params.toDate ?? ""}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Location</label>
            <select name="schoolId" defaultValue={params.schoolId ?? ""}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
              <option value="">All locations</option>
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
                  {formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE, MMM d")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Status</label>
            <select name="status" defaultValue={params.status ?? "ALL"}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Show</label>
            <select name="archived" defaultValue={params.archived ?? "exclude"}
              className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
              <option value="exclude">Active only</option>
              <option value="include">Active + archived</option>
              <option value="only">Archived only</option>
            </select>
          </div>
        </div>

        <div className="mb-2">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Sort by</label>
          <select name="sort" defaultValue={sortKey}
            className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="flex-1 py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
            Apply filters
          </button>
          <Link href="/admin/orders"
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-[12px] font-medium no-underline hover:bg-slate-50 transition whitespace-nowrap">
            Clear
          </Link>
        </div>
      </form>

      {/* ── Orders list ────────────────────────────────────────────── */}
      {orders.length === 0 ? (
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H4a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M23 11a6 6 0 0 0-9-5.5M20 21v-2a6 6 0 0 0-3-5.2"/>
            </svg>
          }
          heading="No orders yet"
          body="Orders will appear here once customers place orders from your ordering page."
          cta={{
            href: "/admin/orders/new",
            label: "Create test order",
          }}
        />
      ) : (
        <OrdersList orders={orders} myRole={myRole} />
      )}
    </div>
  );
}
