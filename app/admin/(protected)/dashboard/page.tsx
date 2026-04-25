import { getAdminDashboardSummary } from "@/lib/admin";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const summary = await getAdminDashboardSummary();

  const stats = [
    { label: "Paid orders", value: summary.paidOrders, color: "text-brand-700", bg: "bg-brand-50" },
    { label: "Refunded", value: summary.refundedOrders, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Cancelled", value: summary.cancelledOrders, color: "text-red-700", bg: "bg-red-50" },
    { label: "Schools", value: summary.schools, color: "text-slate-700", bg: "bg-slate-50" },
  ];

  const quickLinks = [
    {
      href: "/admin/orders", label: "View all orders",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    },
    {
      href: "/admin/reports", label: "Sales reports",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
    },
    {
      href: "/admin/delivery-dates", label: "Add delivery date",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>
    },
    {
      href: "/admin/menu", label: "Manage menu",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
    },
  ];

  return (
    <div className="space-y-4 pb-10">
      <h1 className="text-[17px] font-semibold text-ink">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-[14px] ${bg} border border-white p-4 text-center`}>
            <p className={`text-[28px] font-semibold ${color}`}>{value}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink">Upcoming delivery dates</p>
          <Link href="/admin/delivery-dates" className="text-[11px] text-brand-700 no-underline font-medium">Manage →</Link>
        </div>
        <div className="divide-y divide-slate-50">
          {summary.upcomingDeliveryDates.length ? summary.upcomingDeliveryDates.map((date) => (
            <div key={date.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-ink truncate">{date.school.name}</p>
                <p className="text-[11px] text-slate-500">{formatInTimeZone(date.deliveryDate, date.school.timezone, "EEE, MMM d")}</p>
                <p className="text-[10px] text-slate-400">Cutoff: {formatInTimeZone(date.cutoffAt, date.school.timezone, "MMM d h:mm a zzz")}</p>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-brand-100 text-brand-800 flex-shrink-0">Open</span>
            </div>
          )) : (
            <p className="px-4 py-4 text-[12px] text-slate-400">No upcoming delivery dates.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}
            className="rounded-[14px] border border-slate-100 bg-white px-4 py-3.5 flex items-center gap-3 no-underline hover:border-slate-200 hover:bg-slate-50 transition">
            <span className="text-slate-400">{item.icon}</span>
            <span className="text-[13px] font-medium text-ink">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
