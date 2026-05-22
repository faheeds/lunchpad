import type { Metadata } from "next";
/**
 * Restaurant-wide change log. Shows every audited mutation across the
 * tenant in reverse-chronological order. Visible to STAFF+ for transparency:
 * if menu/settings/orders change, the team can see who did it.
 *
 * Filters (querystring):
 *   ?actor=<adminUserId>  — narrow to one teammate's actions
 *   ?type=<entityType>    — narrow to one entity type (ORDER, MENU_ITEM, etc.)
 *   ?days=<n>             — last n days (default 30)
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  ORDER: "Order",
  MENU_ITEM: "Menu",
  DELIVERY_DATE: "Schedule",
  SCHOOL: "Location",
  RESTAURANT_SETTINGS: "Settings",
  TEAM_MEMBER: "Team",
  ADMIN_INVITE: "Team",
  WEEKLY_BATCH: "Weekly batch",
};

const ACTION_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  CREATED:           { bg: "#DEE2CF", color: "#2C4031", label: "Created" },
  UPDATED:           { bg: "#DEE2CF", color: "#2C4031", label: "Updated" },
  MODIFIED:          { bg: "#DEE2CF", color: "#2C4031", label: "Modified" },
  DELETED:           { bg: "#F6EED9", color: "#C0673E", label: "Deleted" },
  PAID:              { bg: "#DEE2CF", color: "#2C4031", label: "Paid" },
  REFUNDED:          { bg: "#F6EED9", color: "#C0673E", label: "Refunded" },
  CANCELLED:         { bg: "#F6EED9", color: "#C0673E", label: "Cancelled" },
  ARCHIVED:          { bg: "#EFE8D7", color: "#938B78", label: "Archived" },
  UNARCHIVED:        { bg: "#DEE2CF", color: "#2C4031", label: "Unarchived" },
  COMPED:            { bg: "#FEF3F0", color: "#C99A3F", label: "Comped" },
  INVITED:           { bg: "#DEE2CF", color: "#2C4031", label: "Invited" },
  INVITE_ACCEPTED:   { bg: "#DEE2CF", color: "#2C4031", label: "Joined" },
  INVITE_REVOKED:    { bg: "#EFE8D7", color: "#938B78", label: "Cancelled invite" },
  ROLE_CHANGED:      { bg: "#DEE2CF", color: "#2C4031", label: "Role changed" },
  REMOVED:           { bg: "#F6EED9", color: "#C0673E", label: "Removed" },
  PASSWORD_CHANGED:  { bg: "#EFE8D7", color: "#938B78", label: "Password changed" },
  PASSWORD_RESET:    { bg: "#EFE8D7", color: "#938B78", label: "Password reset" },
  LOGGED_IN:         { bg: "#EFE8D7", color: "#938B78", label: "Logged in" },
};

function fmtRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}


export const metadata: Metadata = {
  title: "Activity",
};
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; type?: string; days?: string }>;
}) {
  const restaurant = await requireRestaurant();
  // STAFF+ — every team member should see the change log. Owners and
  // managers care for governance; staff care because they need to know
  // when the menu or schedule changed.
  await requireAdminRole("STAFF");

  const params = await searchParams;
  const days = Math.max(1, Math.min(180, parseInt(params.days ?? "30", 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [logs, admins] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        restaurantId: restaurant.id,
        createdAt: { gte: since },
        ...(params.actor ? { adminUserId: params.actor } : {}),
        ...(params.type ? { entityType: params.type } : {}),
      },
      include: {
        adminUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.adminUser.findMany({
      where: { restaurantId: restaurant.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const entityTypeOptions = ["ORDER", "MENU_ITEM", "DELIVERY_DATE", "SCHOOL", "RESTAURANT_SETTINGS", "TEAM_MEMBER", "ADMIN_INVITE"];

  return (
    <div className="space-y-4 pb-10 bg-editorial-paper min-h-screen">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[17px] font-semibold text-editorial-ink font-editorial">Activity</h1>
        <p className="text-[11px] text-editorial-ink-soft mt-0.5">
          Change log for the last {days} day{days !== 1 ? "s" : ""}
          {logs.length === 200 ? " — showing latest 200" : ` — ${logs.length} event${logs.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <form className="rounded-[16px] border border-editorial-line bg-white p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div>
          <label className="text-[10px] font-semibold text-editorial-ink-faint uppercase tracking-wide block mb-1">Who</label>
          <select name="actor" defaultValue={params.actor ?? ""}
            className="w-full rounded-lg border border-editorial-line text-[12px] py-1.5 px-2 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
            <option value="">Anyone</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-editorial-ink-faint uppercase tracking-wide block mb-1">What</label>
          <select name="type" defaultValue={params.type ?? ""}
            className="w-full rounded-lg border border-editorial-line text-[12px] py-1.5 px-2 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
            <option value="">Everything</option>
            {entityTypeOptions.map((t) => (
              <option key={t} value={t}>{ENTITY_TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-editorial-ink-faint uppercase tracking-wide block mb-1">Window</label>
          <select name="days" defaultValue={String(days)}
            className="w-full rounded-lg border border-editorial-line text-[12px] py-1.5 px-2 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
          </select>
        </div>
        <div className="sm:col-span-3 flex gap-2">
          <button type="submit" className="flex-1 py-2 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
            Apply
          </button>
          <Link href="/admin/activity"
            className="px-4 py-2 rounded-full border border-editorial-line text-editorial-ink text-[12px] font-medium no-underline hover:border-editorial-green hover:text-editorial-green transition whitespace-nowrap">
            Clear
          </Link>
        </div>
      </form>

      {/* ── Feed ──────────────────────────────────────────────────── */}
      {logs.length === 0 ? (
        <EmptyState
          icon="activity"
          title="No activity in this window."
          description="Try widening the date range or removing filters."
        />
      ) : (
        <div className="rounded-[16px] border border-editorial-line bg-white divide-y divide-editorial-line shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          {logs.map((entry) => {
            const badge = ACTION_BADGE[entry.action] ?? { bg: "#EFE8D7", color: "#938B78", label: entry.action };
            const actorName = entry.adminUser?.name ?? (entry.parentUserId ? "Customer" : "System");
            return (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: badge.bg, color: badge.color,
                        borderRadius: 100, padding: "2px 8px",
                      }}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-editorial-ink-faint">
                        {ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType}
                      </span>
                    </div>
                    <p className="text-[13px] text-editorial-ink leading-snug">{entry.summary}</p>
                    <p className="text-[11px] text-editorial-ink-faint mt-1">
                      {actorName}
                      <span className="text-editorial-line mx-1">·</span>
                      {fmtRelative(entry.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
