import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
  const timezone = String(formData.get("timezone") || "America/Los_Angeles");
  const cutoffTime = String(formData.get("cutoffTime") || "21:00");
  const [hourStr, minStr] = cutoffTime.split(":");

  if (!name) throw new Error("Location name is required");

  await prisma.school.create({
    data: {
      restaurantId: restaurant.id,
      name,
      slug: slugify(name),
      timezone,
      defaultCutoffHour: parseInt(hourStr ?? "21", 10),
      defaultCutoffMinute: parseInt(minStr ?? "0", 10),
      collectTeacher: formData.get("collectTeacher") === "on",
      collectClassroom: formData.get("collectClassroom") === "on",
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
  searchParams: Promise<{ edit?: string }>;
}) {
  const [params, restaurant] = await Promise.all([
    searchParams,
    requireRestaurant(),
    requireAdminRole("OWNER"),
  ]);

  const schools = await prisma.school.findMany({
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
  });

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

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[17px] font-semibold text-ink">Locations</h1>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {schools.filter((s) => s.isActive).length} active · {schools.length} total
        </p>
      </div>

      {/* ── School list ────────────────────────────────────────────── */}
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
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#dcfce7", borderRadius: 100, padding: "2px 8px" }}>
                        {school._count.orders} orders
                      </span>
                      <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", borderRadius: 100, padding: "2px 8px" }}>
                        {school._count.deliveryDates} delivery dates
                      </span>
                      {school.collectTeacher && (
                        <span style={{ fontSize: 10, color: "#6b7280" }}>Teacher</span>
                      )}
                      {school.collectClassroom && (
                        <span style={{ fontSize: 10, color: "#6b7280" }}>· Room</span>
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

        {schools.length === 0 && (
          <div className="px-4 py-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <p className="text-[13px] font-medium text-slate-400">No locations yet.</p>
            <p className="text-[11px] text-slate-300 mt-1">Add your first location below.</p>
          </div>
        )}
      </div>

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
