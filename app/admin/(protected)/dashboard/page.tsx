import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { CopyUrlButton } from "@/components/admin/copy-url-button";
import { HomeNudges, type Nudge } from "@/components/admin/home-nudges";
import { SampleDataBanner } from "@/components/admin/sample-data-banner";

export const dynamic = "force-dynamic";

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
    <div className="bg-editorial-paper min-h-screen space-y-5 pb-10">

      {/* ── Ordering URL hero card ────────────────────────────────── */}
      <div className="bg-white border border-editorial-line rounded-[16px] p-5 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint mb-2">
              Your ordering page
            </p>
            <p className="text-[14px] font-semibold text-editorial-ink tracking-tight font-mono mb-2">
              {orderingUrl}
            </p>
            <p className="text-[11px] text-editorial-ink-soft">
              Share this URL with parents to start accepting orders
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <CopyUrlButton url={orderingUrl} />
            <a href={orderingUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-full text-[12px] font-medium border border-editorial-line text-editorial-ink hover:border-editorial-green hover:text-editorial-green no-underline transition">
              Preview ↗
            </a>
          </div>
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
          { label: "Orders",  sub: "today",     value: String(todayOrderCount),       color: "text-editorial-green" },
          { label: "Orders",  sub: "this week",  value: String(weekOrderCount),       color: "text-editorial-green" },
          { label: "Orders",  sub: "all time",   value: String(allTimePaid),          color: "text-editorial-clay" },
          { label: "Revenue", sub: "today",      value: formatCurrency(todayRevenueAmount), color: "text-editorial-gold" },
          { label: "Revenue", sub: "this week",  value: formatCurrency(weekRevenueAmount),  color: "text-editorial-gold" },
          {
            label: "Next delivery",
            sub: nextDelivery ? nextDelivery.school.name : "—",
            value: nextDelivery
              ? formatInTimeZone(nextDelivery.deliveryDate, nextDelivery.school.timezone, "MMM d")
              : "None",
            color: "text-editorial-green",
          },
        ].map(({ label, sub, value, color }) => (
          <div key={`${label}-${sub}`} className="bg-white border border-editorial-line rounded-[16px] p-4 flex flex-col gap-2 min-h-[100px] shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-editorial-ink-faint">
              {label}
            </p>
            <p className={`text-2xl font-bold font-editorial ${color} leading-tight overflow-hidden text-ellipsis whitespace-nowrap`}>
              {value}
            </p>
            <p className="text-[10px] text-editorial-ink-faint overflow-hidden text-ellipsis">
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
      <Link href="/admin/reports" className="block rounded-[16px] border border-editorial-line bg-white px-5 py-4 no-underline hover:border-editorial-green transition shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] flex-shrink-0 bg-editorial-paper-2 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-clay">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-editorial-ink">Sales analytics</p>
            <p className="text-[11px] text-editorial-ink-soft">Revenue trends, top items, date and location breakdowns, CSV export</p>
          </div>
          <span className="text-editorial-ink-faint text-[18px]">›</span>
        </div>
      </Link>

      {/* ── Next delivery spotlight ───────────────────────────────── */}
      {nextDelivery && (
        <div className="bg-white border border-editorial-line rounded-[16px] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint mb-2">
              Next delivery
            </p>
            <p className="text-[20px] font-bold font-editorial text-editorial-ink mb-1 tracking-tight">
              {formatInTimeZone(nextDelivery.deliveryDate, nextDelivery.school.timezone, "EEEE, MMMM d")}
            </p>
            <p className="text-[12px] text-editorial-ink-soft">
              {nextDelivery.school.name} · Cutoff {formatInTimeZone(nextDelivery.cutoffAt, nextDelivery.school.timezone, "MMM d h:mm a zzz")}
            </p>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-center">
              <p className="text-[28px] font-bold font-editorial text-editorial-clay tracking-tight">
                {nextDelivery._count.orders}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-editorial-ink-faint">orders</p>
            </div>
            <Link href={`/admin/orders?deliveryDateId=${nextDelivery.id}`} className="px-4 py-2 bg-editorial-green text-editorial-paper rounded-full text-[12px] font-bold no-underline hover:bg-editorial-green-deep transition">
              View orders →
            </Link>
          </div>
        </div>
      )}

      {/* ── Two-up layout on desktop: schedule + recent orders ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Upcoming schedule ─────────────────────────────────────── */}
      <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-5 py-4 border-b border-editorial-line flex items-center justify-between">
          <p className="text-[13px] font-semibold font-editorial text-editorial-ink">Upcoming schedule</p>
          <Link href="/admin/delivery-dates" className="text-[11px] text-editorial-green no-underline font-medium">Manage →</Link>
        </div>
        <div className="divide-y divide-editorial-line">
          {upcomingDeliveryDates.length ? upcomingDeliveryDates.map((date) => (
            <div key={date.id} className="px-5 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] flex-shrink-0 bg-editorial-paper-2 flex flex-col items-center justify-center">
                <p className="text-[7px] font-bold uppercase text-editorial-clay">
                  {formatInTimeZone(date.deliveryDate, date.school.timezone, "MMM")}
                </p>
                <p className="text-[15px] font-bold text-editorial-clay leading-none">
                  {formatInTimeZone(date.deliveryDate, date.school.timezone, "d")}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-editorial-ink truncate">{date.school.name}</p>
                <p className="text-[11px] text-editorial-ink-soft">
                  Cutoff {formatInTimeZone(date.cutoffAt, date.school.timezone, "h:mm a zzz")}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] font-bold text-editorial-green bg-editorial-sage rounded-full px-3 py-0.5">
                  {date._count.orders} orders
                </span>
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                  date.orderingOpen
                    ? "bg-editorial-paper-2 text-editorial-green"
                    : "bg-editorial-paper-2 text-editorial-ink-faint"
                }`}>
                  {date.orderingOpen ? "Open" : "Closed"}
                </span>
              </div>
            </div>
          )) : (
            <div className="px-5 py-5 text-center">
              <p className="text-[12px] text-editorial-ink-soft mb-2">No upcoming delivery dates.</p>
              <Link href="/admin/delivery-dates" className="text-[12px] text-editorial-green no-underline font-semibold">+ Add delivery date</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Attention inbox ───────────────────────────────────────── */}
      <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-5 py-4 border-b border-editorial-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold font-editorial text-editorial-ink">Needs attention</p>
            {inbox.length > 0 && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#F6EED9] text-[#6E5C2C]">
                {inbox.length}
              </span>
            )}
          </div>
          {inbox.length > 0 && (
            <Link href="/admin/orders?status=PENDING" className="text-[11px] text-editorial-green no-underline font-medium">View all →</Link>
          )}
        </div>
        {inbox.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <div className="w-10 h-10 rounded-full mx-auto mb-2 bg-editorial-sage flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-green">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p className="text-[12px] font-semibold font-editorial text-editorial-ink">All clear</p>
            <p className="text-[11px] text-editorial-ink-soft mt-0.5">Nothing needs your attention right now.</p>
          </div>
        ) : (
          <div className="divide-y divide-editorial-line max-h-[360px] overflow-y-auto">
            {inbox.slice(0, 8).map((item) => {
              const tone =
                item.severity === "danger" ? { bg: "bg-[#F4E3DB]", fg: "text-[#7C3D24]" } :
                item.severity === "warn"   ? { bg: "bg-[#F6EED9]", fg: "text-[#6E5C2C]" } :
                                              { bg: "bg-editorial-paper-2", fg: "text-editorial-green" };
              return (
                <Link key={item.key} href={item.href}
                  className="px-5 py-3 flex items-center gap-3 no-underline hover:bg-editorial-paper-2 transition">
                  <div className={`w-8 h-8 rounded-[8px] flex-shrink-0 ${tone.bg} flex items-center justify-center`}>
                    {item.icon === "clock" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`stroke-current ${tone.fg}`}>
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                    )}
                    {item.icon === "alert" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`stroke-current ${tone.fg}`}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    )}
                    {item.icon === "mail" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`stroke-current ${tone.fg}`}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                      </svg>
                    )}
                    {item.icon === "calendar" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`stroke-current ${tone.fg}`}>
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-editorial-ink truncate">{item.label}</p>
                    <p className="text-[11px] text-editorial-ink-soft truncate">{item.sub}</p>
                  </div>
                  <span className="text-editorial-ink-faint text-[14px]">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-ink-faint mb-2">Quick actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            {
              href: "/admin/delivery-dates",
              label: "Add delivery date",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-clay">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
                </svg>
              ),
            },
            {
              href: "/admin/menu",
              label: "Edit menu",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-clay">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              ),
            },
            {
              href: "/admin/orders",
              label: "View all orders",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-clay">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              ),
            },
            {
              href: "/admin/reports",
              label: "Sales report",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-clay">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              ),
            },
            {
              href: "/admin/kitchen",
              label: "Kitchen sheet",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-clay">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
              ),
            },
          ] as { href: string; label: string; icon: React.ReactNode }[]).map((item) => (
            <Link key={item.href} href={item.href}
              className="rounded-[16px] border border-editorial-line bg-white px-4 py-3.5 flex items-center gap-3 no-underline hover:border-editorial-green transition shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span className="text-[12px] font-medium text-editorial-ink leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
