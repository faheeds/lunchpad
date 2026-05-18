import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ScheduleTabs } from "@/components/admin/schedule-tabs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { slugify } from "@/lib/utils";
import { checkLimit, PlanLimitError, PLAN_LIMITS } from "@/lib/plans";

import { EmptyState } from "@/components/admin/empty-state";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Locations | LunchPad Admin",
};

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)"  },
];

// ── Server actions ──────────────────────────────────────────────────────────

async function createSchool(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const name = String(formData.get("name") || "").trim();
  const locationType = String(formData.get("locationType") || "SCHOOL") === "OFFICE" ? "OFFICE" : "SCHOOL";
  const timezone = String(formData.get("timezone") || "America/Los_Angeles");
  const cutoffTime = String(formData.get("cutoffTime") || "21:00");
  const [hourStr, minStr] = cutoffTime.split(":");

  if (!name) throw new Error("Location name is required");

  // Plan-limit check: count *active* locations against the plan max.
  const currentCount = await prisma.school.count({
    where: { restaurantId: restaurant.id, isActive: true },
  });
  try {
    checkLimit(restaurant.plan, "locations", currentCount);
  } catch (e) {
    if (e instanceof PlanLimitError) {
      redirect(`/admin/locations?error=${encodeURIComponent(e.message)}&upgrade=1`);
    }
    throw e;
  }

  await prisma.school.create({
    data: {
      restaurantId: restaurant.id,
      name,
      slug: slugify(name),
      locationType,
      timezone,
      defaultCutoffHour: parseInt(hourStr ?? "21", 10),
      defaultCutoffMinute: parseInt(minStr ?? "0", 10),
      collectTeacher: locationType === "SCHOOL" && formData.get("collectTeacher") === "on",
      collectClassroom: locationType === "SCHOOL" && formData.get("collectClassroom") === "on",
      isActive: true,
    },
  });
  revalidatePath("/admin/locations");
}

async function updateSchool(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const timezone = String(formData.get("timezone") || "America/Los_Angeles");
  const cutoffTime = String(formData.get("cutoffTime") || "21:00");
  const [hourStr, minStr] = cutoffTime.split(":");

  if (!name) throw new Error("Location name is required");

  await prisma.school.update({
    where: { id, restaurantId: restaurant.id },
    data: {
      name,
      timezone,
      defaultCutoffHour: parseInt(hourStr ?? "21", 10),
      defaultCutoffMinute: parseInt(minStr ?? "0", 10),
      collectTeacher: formData.get("collectTeacher") === "on",
      collectClassroom: formData.get("collectClassroom") === "on",
    },
  });
  revalidatePath("/admin/locations");
  redirect("/admin/locations");
}

async function toggleSchool(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const id = String(formData.get("id"));
  const current = await prisma.school.findUnique({
    where: { id, restaurantId: restaurant.id },
    select: { isActive: true },
  });
  await prisma.school.update({ where: { id }, data: { isActive: !current?.isActive } });
  revalidatePath("/admin/locations");
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function AdminSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; error?: string; upgrade?: string }>;
}) {
  const [params, restaurant] = await Promise.all([
    searchParams,
    requireRestaurant(),
    requireAdminRole("OWNER"),
  ]);

  const planLimits = PLAN_LIMITS[restaurant.plan];

  // Per-location stats: this month revenue + active menu items + next delivery
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [schools, monthRevenueBySchool, nextDeliveryBySchool] = await Promise.all([
    prisma.school.findMany({
      where: { restaurantId: restaurant.id },
      include: {
        _count: {
          select: {
            orders: { where: { status: "PAID", archivedAt: null } },
            deliveryDates: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.payment.groupBy({
      by: ["orderId"],
      where: {
        order: { restaurantId: restaurant.id, status: "PAID" },
        status: "PAID",
        createdAt: { gte: monthStart },
      },
      _sum: { amountCents: true },
    }),
    prisma.deliveryDate.findMany({
      where: { school: { restaurantId: restaurant.id }, deliveryDate: { gte: new Date() } },
      orderBy: { deliveryDate: "asc" },
      select: { id: true, schoolId: true, deliveryDate: true },
    }),
  ]);

  // Build a per-school revenue map by joining payment.orderId → order.schoolId
  const monthRevenueOrderIds = monthRevenueBySchool.map((p) => p.orderId);
  const monthOrders = monthRevenueOrderIds.length > 0
    ? await prisma.order.findMany({
        where: { id: { in: monthRevenueOrderIds } },
        select: { id: true, schoolId: true },
      })
    : [];
  const orderToSchool = new Map(monthOrders.map((o) => [o.id, o.schoolId]));
  const monthRevenueMap = new Map<string, number>();
  for (const p of monthRevenueBySchool) {
    const sid = orderToSchool.get(p.orderId);
    if (!sid) continue;
    monthRevenueMap.set(sid, (monthRevenueMap.get(sid) ?? 0) + (p._sum.amountCents ?? 0));
  }

  // Next-delivery map (first by date)
  const nextDeliveryMap = new Map<string, Date>();
  for (const d of nextDeliveryBySchool) {
    if (!nextDeliveryMap.has(d.schoolId)) {
      nextDeliveryMap.set(d.schoolId, d.deliveryDate);
    }
  }

  const editingId = params.edit ?? null;

  function cutoffLabel(hour: number, minute: number) {
    const h = hour % 12 || 12;
    const m = String(minute).padStart(2, "0");
    const ampm = hour >= 12 ? "PM" : "AM";
    return `${h}:${m} ${ampm}`;
  }

  function cutoffValue(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const tzLabel = (tz: string) => TIMEZONES.find((t) => t.value === tz)?.label ?? tz;

  return (
    <div className="space-y-5 pb-10">

      <ScheduleTabs active="locations" />

      {/* ── Plan-limit error / upgrade banner ─────────────────────── */}
      {params.error && (
        <div className="rounded-[12px] bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[12px] text-amber-800 flex-1 min-w-[200px]">{params.error}</p>
          {params.upgrade === "1" && (
            <a href="/admin/subscription" className="text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg no-underline">
              Upgrade →
            </a>
          )}
        </div>
      )}

      {/* ── School list ────────────────────────────────────────────── */}
      {schools.length > 0 && (
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden divide-y divide-slate-50">
        {schools.map((school) => {
          const isEditing = editingId === school.id;
          return (
            <div key={school.id}>
              {/* School card */}
              <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: school.isActive ? "#fff1f3" : "#f3f4f6",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={school.isActive ? "#c41230" : "#9ca3af"}
                      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-ink">{school.name}</p>
                      {!school.isActive && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", background: "#f3f4f6", borderRadius: 100, padding: "2px 8px" }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {tzLabel(school.timezone)} · Cutoff {cutoffLabel(school.defaultCutoffHour, school.defaultCutoffMinute)}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        school.locationType === "OFFICE" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-700"
                      }`}>
                        {school.locationType === "OFFICE" ? "Office" : "School"}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#dcfce7", borderRadius: 100, padding: "2px 8px" }}>
                        {school._count.orders} orders all-time
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#0369a1", background: "#eff6ff", borderRadius: 100, padding: "2px 8px" }}>
                        ${((monthRevenueMap.get(school.id) ?? 0) / 100).toFixed(0)} this month
                      </span>
                      <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", borderRadius: 100, padding: "2px 8px" }}>
                        {school._count.deliveryDates} dates
                      </span>
                      {nextDeliveryMap.get(school.id) && (
                        <span style={{ fontSize: 11, color: "#7c3aed", background: "#f5f3ff", borderRadius: 100, padding: "2px 8px" }}>
                          Next: {nextDeliveryMap.get(school.id)!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <a href={`/admin/locations?edit=${school.id}`}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-600 no-underline hover:bg-slate-50 transition">
                      Edit
                    </a>
                    <form action={toggleSchool}>
                      <input type="hidden" name="id" value={school.id} />
                      <button type="submit"
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition"
                        style={school.isActive
                          ? { borderColor: "#fecdd3", color: "#c41230", background: "transparent" }
                          : { borderColor: "#bbf7d0", color: "#15803d", background: "transparent" }
                        }>
                        {school.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Edit form (inline) */}
                {isEditing && (
                  <form action={updateSchool} className="mt-4 p-3 rounded-[12px] bg-slate-50 border border-slate-100 space-y-3">
                    <input type="hidden" name="id" value={school.id} />
                    <p className="text-[12px] font-semibold text-ink">Edit {school.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-500 font-medium block mb-1">Location name</label>
                        <input type="text" name="name" required defaultValue={school.name}
                          className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20 bg-white" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 font-medium block mb-1">Timezone</label>
                        <select name="timezone" defaultValue={school.timezone}
                          className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/20">
                          {TIMEZONES.map((tz) => (
                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">Default ordering cutoff</label>
                      <input type="time" name="cutoffTime" required
                        defaultValue={cutoffValue(school.defaultCutoffHour, school.defaultCutoffMinute)}
                        className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
                      <p className="text-[10px] text-slate-400 mt-1">Parents cannot order after this time the night before delivery.</p>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                        <input type="checkbox" name="collectTeacher" defaultChecked={school.collectTeacher} className="rounded" />
                        Collect teacher name
                      </label>
                      <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                        <input type="checkbox" name="collectClassroom" defaultChecked={school.collectClassroom} className="rounded" />
                        Collect classroom
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit"
                        className="flex-1 py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
                        Save changes
                      </button>
                      <a href="/admin/locations"
                        className="px-4 py-2 rounded-lg border border-slate-200 text-[12px] text-slate-500 no-underline hover:bg-white transition">
                        Cancel
                      </a>
                    </div>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {schools.length === 0 && (
        <EmptyState
          icon="home"
          title="No locations yet."
          description="Add your first location below."
        />
      )}

      {/* ── Add school ─────────────────────────────────────────────── */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/>
            </svg>
            Add location
          </span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>
        <form action={createSchool} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">Location type</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-slate-200 px-3 py-2.5 has-[:checked]:bg-brand-50 has-[:checked]:border-brand-700 transition">
                <input type="radio" name="locationType" value="SCHOOL" defaultChecked className="mt-0.5" />
                <div>
                  <p className="text-[12px] font-semibold text-ink">School</p>
                  <p className="text-[10px] text-slate-400">Students, classrooms, teachers</p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-slate-200 px-3 py-2.5 has-[:checked]:bg-brand-50 has-[:checked]:border-brand-700 transition">
                <input type="radio" name="locationType" value="OFFICE" className="mt-0.5" />
                <div>
                  <p className="text-[12px] font-semibold text-ink">Office</p>
                  <p className="text-[10px] text-slate-400">Employees, teams, floors</p>
                </div>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Location name</label>
              <input type="text" name="name" required placeholder="HQ \u2014 Main Office"
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Timezone</label>
              <select name="timezone" defaultValue="America/Los_Angeles"
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">Default ordering cutoff</label>
            <input type="time" name="cutoffTime" defaultValue="21:00" required
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            <p className="text-[10px] text-slate-400 mt-1">Parents cannot order after this time the night before delivery.</p>
          </div>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" name="collectTeacher" defaultChecked className="rounded" />
              Collect teacher name
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" name="collectClassroom" defaultChecked className="rounded" />
              Collect classroom
            </label>
          </div>
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Add location
          </button>
        </form>
      </details>
    </div>
  );
}
