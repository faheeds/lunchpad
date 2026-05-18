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

export const metadata: Metadata = {
  title: "Activity | LunchPad Admin",
};

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
  CREATED:           { bg: "#dbeafe", color: "#1d4ed8", label: "Created" },
  UPDATED:           { bg: "#e0e7ff", color: "#4338ca", label: "Updated" },
  MODIFIED:          { bg: "#e0e7ff", color: "#4338ca", label: "Modified" },
  DELETED:           { bg: "#fee2e2", color: "#b91c1c", label: "Deleted" },
  PAID:              { bg: "#dcfce7", color: "#15803d", label: "Paid" },
  REFUNDED:          { bg: "#fee2e2", color: "#b91c1c", label: "Refunded" },
  CANCELLED:         { bg: "#fee2e2", color: "#b91c1c", label: "Cancelled" },
  ARCHIVED:          { bg: "#f3f4f6", color: "#6b7280", label: "Archived" },
  UNARCHIVED:        { bg: "#dcfce7", color: "#15803d", label: "Unarchived" },
  COMPED:            { bg: "#fef3c7", color: "#92400e", label: "Comped" },
  INVITED:           { bg: "#dbeafe", color: "#1d4ed8", label: "Invited" },
  INVITE_ACCEPTED:   { bg: "#dcfce7", color: "#15803d", label: "Joined" },
  INVITE_REVOKED:    { bg: "#f3f4f6", color: "#6b7280", label: "Cancelled invite" },
  ROLE_CHANGED:      { bg: "#e0e7ff", color: "#4338ca", label: "Role changed" },
  REMOVED:           { bg: "#fee2e2", color: "#b91c1c", label: "Removed" },
  PASSWORD_CHANGED:  { bg: "#f3f4f6", color: "#6b7280", label: "Password changed" },
  PASSWORD_RESET:    { bg: "#f3f4f6", color: "#6b7280", label: "Password reset" },
  LOGGED_IN:         { bg: "#f3f4f6", color: "#6b7280", label: "Logged in" },
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
    <div className="space-y-4 pb-10">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[17px] font-semibold text-ink">Activity</h1>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Change log for the last {days} day{days !== 1 ? "s" : ""}
          {logs.length === 200 ? " — showing latest 200" : ` — ${logs.length} event${logs.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <form className="rounded-[14px] border border-slate-100 bg-white p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Who</label>
          <select name="actor" defaultValue={params.actor ?? ""}
            className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
            <option value="">Anyone</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">What</label>
          <select name="type" defaultValue={params.type ?? ""}
            className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
            <option value="">Everything</option>
            {entityTypeOptions.map((t) => (
              <option key={t} value={t}>{ENTITY_TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Window</label>
          <select name="days" defaultValue={String(days)}
            className="w-full rounded-lg border-slate-200 text-[12px] py-1.5 px-2">
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
          </select>
        </div>
        <div className="sm:col-span-3 flex gap-2">
          <button type="submit" className="flex-1 py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
            Apply
          </button>
          <Link href="/admin/activity"
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-[12px] font-medium no-underline hover:bg-slate-50 transition whitespace-nowrap">
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
        <div className="rounded-[14px] border border-slate-100 bg-white divide-y divide-slate-50">
          {logs.map((entry) => {
            const badge = ACTION_BADGE[entry.action] ?? { bg: "#f3f4f6", color: "#6b7280", label: entry.action };
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
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType}
                      </span>
                    </div>
                    <p className="text-[13px] text-ink leading-snug">{entry.summary}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {actorName}
                      <span className="text-slate-300 mx-1">·</span>
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
