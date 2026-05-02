import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const restaurant = await requireRestaurant();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    todayOrderCount,
    todayRevenue,
    allTimePaid,
    upcomingDeliveryDates,
    recentOrders,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        restaurantId: restaurant.id,
        status: "PAID",
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        order: { restaurantId: restaurant.id, status: "PAID" },
        status: "PAID",
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.order.count({
      where: { restaurantId: restaurant.id, status: "PAID", archivedAt: null },
    }),
    prisma.deliveryDate.findMany({
      where: { deliveryDate: { gte: new Date() }, school: { restaurantId: restaurant.id } },
      include: {
        school: true,
        _count: { select: { orders: { where: { status: "PAID" } } } },
      },
      take: 5,
      orderBy: { deliveryDate: "asc" },
    }),
    prisma.order.findMany({
      where: { restaurantId: restaurant.id, archivedAt: null },
      include: { student: true, school: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const todayRevenueAmount = todayRevenue._sum.amountCents ?? 0;
  const nextDelivery = upcomingDeliveryDates[0] ?? null;

  const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    PAID:      { bg: "#dcfce7", text: "#15803d", label: "Paid" },
    PENDING:   { bg: "#fef9c3", text: "#854d0e", label: "Pending" },
    CANCELLED: { bg: "#fee2e2", text: "#b91c1c", label: "Cancelled" },
    REFUNDED:  { bg: "#f3f4f6", text: "#6b7280", label: "Refunded" },
  };

  return (
    <div className="space-y-5 pb-10">

      {/* ── Today snapshot ────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2">Today</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Orders today",    value: todayOrderCount,                color: "#c41230", bg: "#fff1f3", sub: "paid today" },
            { label: "Revenue today",   value: formatCurrency(todayRevenueAmount), color: "#0369a1", bg: "#eff6ff", sub: "collected" },
            { label: "All-time orders", value: allTimePaid,                    color: "#7c3aed", bg: "#f5f3ff", sub: "paid orders" },
            {
              label: "Next delivery",
              value: nextDelivery ? formatInTimeZone(nextDelivery.deliveryDate, nextDelivery.school.timezone, "MMM d") : "—",
              color: "#059669", bg: "#ecfdf5",
              sub: nextDelivery ? nextDelivery.school.name : "No upcoming dates",
            },
          ].map(({ label, value, color, bg, sub }) => (
            <div key={label} style={{ background: bg, borderRadius: 14, padding: "16px 16px 14px", border: "1px solid rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 500 }}>{label}</p>
              <p style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, marginBottom: 4, letterSpacing: "-0.02em" }}>
                {value}
              </p>
              <p style={{ fontSize: 11, color: "#9ca3af" }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Next delivery spotlight ───────────────────────────────── */}
      {nextDelivery && (
        <div style={{
          background: "linear-gradient(135deg, #0f1923 0%, #1a2d42 100%)",
          borderRadius: 16, padding: "20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              Next delivery
            </p>
            <p style={{ fontSize: 20, fontWeight: 800, color: "white", marginBottom: 2, letterSpacing: "-0.02em" }}>
              {formatInTimeZone(nextDelivery.deliveryDate, nextDelivery.school.timezone, "EEEE, MMMM d")}
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              {nextDelivery.school.name} &middot; Cutoff {formatInTimeZone(nextDelivery.cutoffAt, nextDelivery.school.timezone, "MMM d h:mm a zzz")}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 28, fontWeight: 900, color: "#f87171", letterSpacing: "-0.04em" }}>
                {nextDelivery._count.orders}
              </p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>orders</p>
            </div>
            <Link href={`/admin/orders?deliveryDateId=${nextDelivery.id}`} style={{
              padding: "10px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700,
              background: "rgba(196,18,48,0.85)", color: "white", textDecoration: "none",
            }}>
              View orders →
            </Link>
          </div>
        </div>
      )}

      {/* ── Upcoming schedule ─────────────────────────────────────── */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink">Upcoming schedule</p>
          <Link href="/admin/delivery-dates" className="text-[11px] text-brand-700 no-underline font-medium">Manage →</Link>
        </div>
        <div className="divide-y divide-slate-50">
          {upcomingDeliveryDates.length ? upcomingDeliveryDates.map((date) => (
            <div key={date.id} className="px-4 py-3 flex items-center gap-3">
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: "#fff1f3", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}>
                <p style={{ fontSize: 7, fontWeight: 700, color: "#c41230", textTransform: "uppercase" }}>
                  {formatInTimeZone(date.deliveryDate, date.school.timezone, "MMM")}
                </p>
                <p style={{ fontSize: 15, fontWeight: 800, color: "#c41230", lineHeight: 1 }}>
                  {formatInTimeZone(date.deliveryDate, date.school.timezone, "d")}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-ink truncate">{date.school.name}</p>
                <p className="text-[11px] text-slate-400">
                  Cutoff {formatInTimeZone(date.cutoffAt, date.school.timezone, "h:mm a zzz")}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#dcfce7", borderRadius: 100, padding: "3px 10px" }}>
                  {date._count.orders} orders
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: date.orderingOpen ? "#0369a1" : "#6b7280",
                  background: date.orderingOpen ? "#eff6ff" : "#f3f4f6",
                  borderRadius: 100, padding: "3px 8px",
                }}>
                  {date.orderingOpen ? "Open" : "Closed"}
                </span>
              </div>
            </div>
          )) : (
            <div className="px-4 py-5 text-center">
              <p className="text-[12px] text-slate-400 mb-2">No upcoming delivery dates.</p>
              <Link href="/admin/delivery-dates" className="text-[12px] text-brand-700 no-underline font-semibold">+ Add delivery date</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent orders ─────────────────────────────────────────── */}
      {recentOrders.length > 0 && (
        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">Recent orders</p>
            <Link href="/admin/orders" className="text-[11px] text-brand-700 no-underline font-medium">All orders →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentOrders.map((order) => {
              const badge = STATUS_COLORS[order.status] ?? STATUS_COLORS.PENDING;
              return (
                <Link key={order.id} href={`/admin/orders/${order.id}`}
                  className="px-4 py-3 flex items-center gap-3 no-underline hover:bg-slate-50 transition">
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: "#fff1f3", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#c41230",
                  }}>
                    {(order.student?.studentName ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{order.student?.studentName ?? "Unknown"}</p>
                    <p className="text-[11px] text-slate-400 truncate">{order.school.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <p className="text-[13px] font-semibold text-ink">{formatCurrency(order.totalCents)}</p>
                    <span style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.text, borderRadius: 100, padding: "3px 8px" }}>
                      {badge.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2">Quick actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/admin/delivery-dates", label: "Add delivery date", icon: "📅" },
            { href: "/admin/menu",           label: "Edit menu",         icon: "🍔" },
            { href: "/admin/orders",         label: "View all orders",   icon: "📋" },
            { href: "/admin/reports",        label: "Sales report",      icon: "📊" },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className="rounded-[14px] border border-slate-100 bg-white px-4 py-3.5 flex items-center gap-3 no-underline hover:border-slate-200 hover:bg-slate-50 transition">
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span className="text-[12px] font-medium text-ink">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
