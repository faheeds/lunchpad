import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { CopyUrlButton } from "@/components/admin/copy-url-button";
import { HomeNudges, type Nudge } from "@/components/admin/home-nudges";
import { SampleDataBanner } from "@/components/admin/sample-data-banner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | LunchPad Admin",
};

export default async function AdminDashboardPage() {
  const restaurant = await requireRestaurant();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Start of current Mon–Sun week (Monday = day 1)
  const weekStart = new Date(todayStart);
  const dayOfWeek = weekStart.getDay(); // 0=Sun, 1=Mon…
  weekStart.setDate(weekStart.getDate() - ((dayOfWeek + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Cutoffs for the "Attention" inbox.
  const stalePendingThreshold = new Date(Date.now() - 30 * 60 * 1000); // older than 30m
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [
    todayOrderCount,
    todayRevenue,
    weekOrderCount,
    weekRevenue,
    allTimePaid,
    upcomingDeliveryDates,
    recentOrders,
    stalePendingOrders,
    failedPayments,
    failedEmails,
    cuttingOffSoon,
    hasSampleSchool,
    hasSampleMenuItem,
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
      where: {
        restaurantId: restaurant.id,
        status: "PAID",
        createdAt: { gte: weekStart, lte: weekEnd },
      },
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        order: { restaurantId: restaurant.id, status: "PAID" },
        status: "PAID",
        createdAt: { gte: weekStart, lte: weekEnd },
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
    // Inbox: pending orders older than 30 minutes (likely abandoned)
    prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        status: "PENDING",
        createdAt: { lt: stalePendingThreshold },
        archivedAt: null,
      },
      include: { student: true, school: true },
      take: 5,
      orderBy: { createdAt: "asc" },
    }),
    // Inbox: failed payments in the last 7 days
    prisma.payment.findMany({
      where: {
        order: { restaurantId: restaurant.id },
        status: "FAILED",
        createdAt: { gte: sevenDaysAgo },
      },
      include: { order: { include: { student: true } } },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Inbox: failed email logs in the last 7 days
    prisma.emailLog.findMany({
      where: {
        order: { restaurantId: restaurant.id },
        status: "FAILED",
        createdAt: { gte: sevenDaysAgo },
      },
      include: { order: { include: { student: true } } },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    // Inbox: delivery dates with cutoff in next 24h
    prisma.deliveryDate.findMany({
      where: {
        school: { restaurantId: restaurant.id },
        cutoffAt: { gte: new Date(), lte: next24h },
        orderingOpen: true,
      },
      include: {
        school: true,
        _count: { select: { orders: { where: { status: "PAID" } } } },
      },
      orderBy: { cutoffAt: "asc" },
    }),
    prisma.school.count({
      where: { restaurantId: restaurant.id, name: { startsWith: "[Sample]" } },
    }),
    prisma.menuItem.count({
      where: { restaurantId: restaurant.id, name: { startsWith: "[Sample]" } },
    }),
  ]);

  const todayRevenueAmount = todayRevenue._sum.amountCents ?? 0;
  const weekRevenueAmount = weekRevenue._sum.amountCents ?? 0;
  const nextDelivery = upcomingDeliveryDates[0] ?? null;

  const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    PAID:      { bg: "#dcfce7", text: "#15803d", label: "Paid" },
    PENDING:   { bg: "#fef9c3", text: "#854d0e", label: "Pending" },
    CANCELLED: { bg: "#fee2e2", text: "#b91c1c", label: "Cancelled" },
    REFUNDED:  { bg: "#f3f4f6", text: "#6b7280", label: "Refunded" },
  };

  const orderingUrl = `https://${restaurant.slug}.lunchpad.us`;

  // Build the inbox feed.
  type InboxItem = {
    key: string;
    severity: "warn" | "info" | "danger";
    icon: string;
    label: string;
    sub: string;
    href: string;
  };

  const inbox: InboxItem[] = [];

  for (const o of stalePendingOrders) {
    inbox.push({
      key: `pending-${o.id}`,
      severity: "warn",
      icon: "clock",
      label: `${o.student?.studentName ?? "Order"} — payment not completed`,
      sub: `${o.school.name} · started ${Math.round((Date.now() - o.createdAt.getTime()) / 60000)}m ago`,
      href: `/admin/orders/${o.id}`,
    });
  }
  for (const p of failedPayments) {
    inbox.push({
      key: `pay-${p.id}`,
      severity: "danger",
      icon: "alert",
      label: `Payment failed for ${p.order.student?.studentName ?? "order"}`,
      sub: `$${(p.amountCents / 100).toFixed(2)} · contact the customer`,
      href: `/admin/orders/${p.orderId}`,
    });
  }
  for (const e of failedEmails) {
    inbox.push({
      key: `mail-${e.id}`,
      severity: "warn",
      icon: "mail",
      label: `Email bounced — ${e.recipient}`,
      sub: `${e.emailType} · ${e.errorMessage?.slice(0, 60) ?? "delivery failed"}`,
      href: `/admin/orders/${e.orderId}`,
    });
  }
  for (const d of cuttingOffSoon) {
    const hoursToCutoff = Math.max(0, Math.round((d.cutoffAt.getTime() - Date.now()) / 3600000));
    if (d._count.orders < 5) {
      inbox.push({
        key: `cutoff-${d.id}`,
        severity: "info",
        icon: "calendar",
        label: `Cutoff in ${hoursToCutoff}h — only ${d._count.orders} ${d._count.orders === 1 ? "order" : "orders"}`,
        sub: `${d.school.name} · share the URL or send a reminder`,
        href: `/admin/orders?deliveryDateId=${d.id}`,
      });
    }
  }


  // ── Home nudges (replacement for blocking onboarding steps) ─────
  // Each banner shows only when its underlying condition is still
  // pending; HomeNudges lets the user dismiss them via localStorage.
  const adminUserCount = await prisma.adminUser.count({
    where: { restaurantId: restaurant.id },
  });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentSignup = restaurant.createdAt >= thirtyDaysAgo;
  const nudges: Nudge[] = [];
  if (adminUserCount === 1) nudges.push({
    kind: "invite_team",
    title: "Working with others?",
    body: "Invite teammates so you do not have to manage every order alone.",
    ctaText: "Invite team",
    ctaHref: "/admin/team",
  });
  if (!restaurant.kitchenSheetSendHour) nudges.push({
    kind: "notifications",
    title: "Want a daily kitchen sheet?",
    body: "Get the days orders emailed to you automatically at a time of your choosing.",
    ctaText: "Configure notifications",
    ctaHref: "/admin/settings?tab=notifications",
  });
  if (!restaurant.testOrderPlacedAt && recentSignup) nudges.push({
    kind: "test_order",
    title: "Try ordering as a customer",
    body: "Place a test order to see what your customers experience. Refundable in one click afterwards.",
    ctaText: "Place a test order",
    ctaHref: orderingUrl,
  });
  if (allTimePaid === 0) nudges.push({
    kind: "share_url",
    title: "Share your ordering URL",
    body: "You are set up but no orders yet. Send the URL to your customers and start taking orders.",
    ctaText: "Copy URL",
    ctaHref: "/admin/settings?tab=domain",
  });

  return (
    <div className="space-y-5 pb-10">

      {/* ── Ordering URL hero card ────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 100%)",
        borderRadius: 16, padding: "18px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
            Your ordering page
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#86efac", letterSpacing: "-0.01em", fontFamily: "monospace" }}>
            {orderingUrl}
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
            Share this URL with parents to start accepting orders
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <CopyUrlButton url={orderingUrl} />
          <a href={orderingUrl} target="_blank" rel="noopener noreferrer" style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: "rgba(255,255,255,0.1)", color: "white", textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.15)",
          }}>
            Preview ↗
          </a>
        </div>
      </div>

      {/* ── Sample data banner ───────────────────────────────────── */}
      {(hasSampleSchool > 0 || hasSampleMenuItem > 0) && (
        <SampleDataBanner slug={restaurant.slug} />
      )}

      {/* ── Nudge banners ─────────────────────────────────────────── */}
      <HomeNudges nudges={nudges} slug={restaurant.slug} />

      {/* ── Stat tiles ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Orders",  sub: "today",     value: String(todayOrderCount),       color: "#c41230", bg: "#fff1f3", border: "#fecdd3" },
          { label: "Orders",  sub: "this week",  value: String(weekOrderCount),         color: "#c41230", bg: "#fff1f3", border: "#fecdd3" },
          { label: "Orders",  sub: "all time",   value: String(allTimePaid),            color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
          { label: "Revenue", sub: "today",      value: formatCurrency(todayRevenueAmount), color: "#0369a1", bg: "#eff6ff", border: "#bfdbfe" },
          { label: "Revenue", sub: "this week",  value: formatCurrency(weekRevenueAmount),  color: "#0369a1", bg: "#eff6ff", border: "#bfdbfe" },
          {
            label: "Next delivery",
            sub: nextDelivery ? nextDelivery.school.name : "—",
            value: nextDelivery
              ? formatInTimeZone(nextDelivery.deliveryDate, nextDelivery.school.timezone, "MMM d")
              : "None",
            color: "#059669", bg: "#ecfdf5", border: "#a7f3d0",
          },
        ].map(({ label, sub, value, color, bg, border }) => (
          <div key={`${label}-${sub}`} style={{
            background: bg, borderRadius: 14,
            border: `1px solid ${border}`,
            padding: "12px 12px 10px",
            display: "flex", flexDirection: "column", gap: 5,
            minHeight: 86,
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              {label}
            </p>
            <p style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value}
            </p>
            <p style={{ fontSize: 9, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {sub}
            </p>
          </div>
        ))}
      </div>

      {/* ── Sales analytics drill-down ──────────────────────────── */}
      {/* Reports used to be its own top-level tab. We folded the
          nav entry into Home so operators have one daily landing
          page; the deep analytics view (charts, date breakdowns,
          CSV export) is still accessible one click away. */}
      <Link href="/admin/reports" className="block rounded-[14px] border border-slate-100 bg-white px-4 py-3.5 no-underline hover:border-red-100 hover:bg-red-50 transition">
        <div className="flex items-center gap-3">
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "#fff1f3", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink">Sales analytics</p>
            <p className="text-[11px] text-slate-400">Revenue trends, top items, date and location breakdowns, CSV export</p>
          </div>
          <span className="text-slate-300 text-[18px]">›</span>
        </div>
      </Link>

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

      {/* ── Two-up layout on desktop: schedule + recent orders ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

      {/* ── Attention inbox ───────────────────────────────────────── */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-ink">Needs attention</p>
            {inbox.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {inbox.length}
              </span>
            )}
          </div>
          {inbox.length > 0 && (
            <Link href="/admin/orders?status=PENDING" className="text-[11px] text-brand-700 no-underline font-medium">View all →</Link>
          )}
        </div>
        {inbox.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div style={{
              width: 40, height: 40, borderRadius: "50%", margin: "0 auto 8px",
              background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p className="text-[12px] font-semibold text-ink">All clear</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Nothing needs your attention right now.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 max-h-[360px] overflow-y-auto">
            {inbox.slice(0, 8).map((item) => {
              const tone =
                item.severity === "danger" ? { bg: "#fee2e2", fg: "#b91c1c" } :
                item.severity === "warn"   ? { bg: "#fef9c3", fg: "#854d0e" } :
                                              { bg: "#dbeafe", fg: "#1e40af" };
              return (
                <Link key={item.key} href={item.href}
                  className="px-4 py-3 flex items-center gap-3 no-underline hover:bg-slate-50 transition">
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: tone.bg, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {item.icon === "clock" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tone.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                    )}
                    {item.icon === "alert" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tone.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    )}
                    {item.icon === "mail" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tone.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                      </svg>
                    )}
                    {item.icon === "calendar" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tone.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-ink truncate">{item.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">{item.sub}</p>
                  </div>
                  <span className="text-slate-300 text-[14px]">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2">Quick actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            {
              href: "/admin/delivery-dates",
              label: "Add delivery date",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
                </svg>
              ),
            },
            {
              href: "/admin/menu",
              label: "Edit menu",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              ),
            },
            {
              href: "/admin/orders",
              label: "View all orders",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              ),
            },
            {
              href: "/admin/reports",
              label: "Sales report",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              ),
            },
            {
              href: "/admin/kitchen",
              label: "Kitchen sheet",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
              ),
            },
          ] as { href: string; label: string; icon: React.ReactNode }[]).map((item) => (
            <Link key={item.href} href={item.href}
              className="rounded-[14px] border border-slate-100 bg-white px-4 py-3.5 flex items-center gap-3 no-underline hover:border-red-100 hover:bg-red-50 transition">
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span className="text-[12px] font-medium text-ink leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
