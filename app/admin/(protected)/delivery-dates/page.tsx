import { revalidatePath } from "next/cache";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// ── Server actions ────────────────────────────────────────────────────────────

async function createDeliveryDate(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const schoolId       = String(formData.get("schoolId") || "");
  const deliveryDateStr = String(formData.get("deliveryDate") || "");
  const cutoffAtStr    = String(formData.get("cutoffAt") || "");
  const notes          = String(formData.get("notes") || "").trim() || null;
  const orderingOpen   = formData.get("orderingOpen") === "on";

  if (!schoolId || !deliveryDateStr || !cutoffAtStr) return;

  // Tenant-scoped: school must belong to this restaurant
  const school = await prisma.school.findFirst({
    where: { id: schoolId, restaurantId: restaurant.id },
    select: { timezone: true },
  });
  if (!school) return;

  const newDeliveryDate = await prisma.deliveryDate.create({
    data: {
      schoolId,
      deliveryDate: fromZonedTime(`${deliveryDateStr} 11:00:00`, school.timezone),
      cutoffAt:     fromZonedTime(cutoffAtStr.replace("T", " ") + ":00", school.timezone),
      orderingOpen,
      notes,
    },
  });

  // Auto-attach all active menu items to this delivery date so the customer
  // ordering page has options out of the box. Admins can un-check items they
  // don't want available on this date via the existing attach-menu-items UI.
  const activeMenuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true, schoolRestrictions: { select: { schoolId: true } } },
  });
  const eligibleForThisSchool = activeMenuItems.filter(
    (item) =>
      item.schoolRestrictions.length === 0 ||
      item.schoolRestrictions.some((r) => r.schoolId === schoolId)
  );
  if (eligibleForThisSchool.length > 0) {
    await prisma.deliveryMenuItem.createMany({
      data: eligibleForThisSchool.map((m) => ({
        deliveryDateId: newDeliveryDate.id,
        menuItemId: m.id,
        schoolId,
        isAvailable: true,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/admin/delivery-dates");
}

async function toggleDateOpen(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  // Tenant-scoped: delivery date must belong to a school in this restaurant
  const current = await prisma.deliveryDate.findFirst({
    where: { id, school: { restaurantId: restaurant.id } },
    select: { orderingOpen: true },
  });
  if (!current) throw new Error("Delivery date not found");
  await prisma.deliveryDate.update({ where: { id }, data: { orderingOpen: !current.orderingOpen } });
  revalidatePath("/admin/delivery-dates");
}

async function attachMenuItems(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const deliveryDateId = String(formData.get("deliveryDateId"));
  const schoolId       = String(formData.get("schoolId"));
  const submittedIds   = new Set(formData.getAll("menuItemIds").map(String));

  // Tenant-scoped: verify deliveryDate and school belong to this restaurant
  const verifiedDate = await prisma.deliveryDate.findFirst({
    where: { id: deliveryDateId, school: { restaurantId: restaurant.id, id: schoolId } },
    select: { id: true },
  });
  if (!verifiedDate) throw new Error("Delivery date not found");

  // Only operate on items that are active AND allowed for this school AND in this restaurant
  const allActiveMenuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true, schoolRestrictions: { select: { schoolId: true } } },
  });
  const activeMenuItems = allActiveMenuItems.filter(
    (item) =>
      item.schoolRestrictions.length === 0 ||
      item.schoolRestrictions.some((r) => r.schoolId === schoolId)
  );

  await prisma.$transaction(
    activeMenuItems.map((item) => {
      const shouldBeAvailable = submittedIds.has(item.id);
      const rawQty = formData.get(`maxQty_${item.id}`);
      const maxQuantity = rawQty && String(rawQty).trim() !== ""
        ? parseInt(String(rawQty), 10) || null
        : null;
      return prisma.deliveryMenuItem.upsert({
        where:  { deliveryDateId_menuItemId: { deliveryDateId, menuItemId: item.id } },
        update: { isAvailable: shouldBeAvailable, maxQuantity: shouldBeAvailable ? maxQuantity : null },
        create: { deliveryDateId, menuItemId: item.id, schoolId, isAvailable: shouldBeAvailable, maxQuantity: shouldBeAvailable ? maxQuantity : null },
      });
    }),
  );
  revalidatePath("/admin/delivery-dates");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DeliveryDatesPage() {
  const [restaurant] = await Promise.all([requireRestaurant(), requireAdminRole("MANAGER")]);

  const [schools, deliveryDates, menuItems] = await Promise.all([
    prisma.school.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.deliveryDate.findMany({
      where: { school: { restaurantId: restaurant.id } },
      include: {
        school: true,
        menuAvailability: {
          where: { isAvailable: true },
          include: { menuItem: { select: { id: true, name: true } } },
          orderBy: { menuItem: { name: "asc" } },
        },
        orders: {
          where: { status: "PAID", archivedAt: null },
          select: { items: { select: { menuItemId: true } } },
        },
        _count: {
          select: { orders: { where: { status: "PAID" } } },
        },
      },
      orderBy: { deliveryDate: "asc" },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      include: { schoolRestrictions: { select: { schoolId: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const now      = new Date();
  const upcoming = deliveryDates.filter((d) => d.deliveryDate >= now);
  const past     = deliveryDates.filter((d) => d.deliveryDate < now);

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ─────────────────────���───────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-semibold text-ink">Schedule</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {upcoming.length} upcoming · {past.length} past
          </p>
        </div>
      </div>

      {/* ── Add delivery date ───────────────────────────────────────── */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
            </svg>
            Add delivery date
          </span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>

        <form action={createDeliveryDate} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">School</label>
              <select name="schoolId" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2">
                <option value="">Select school…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Delivery date</label>
              <input type="date" name="deliveryDate" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Ordering closes at</label>
              <input type="datetime-local" name="cutoffAt" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
              <p className="text-[10px] text-slate-400 mt-1">In the school&apos;s timezone</p>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <input type="text" name="notes" placeholder="e.g. Pizza day!"
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
            <input type="checkbox" name="orderingOpen" defaultChecked className="rounded" />
            Open for ordering immediately
          </label>
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Create delivery date
          </button>
        </form>
      </details>

      {/* ── Upcoming dates ──────────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">
            Upcoming ({upcoming.length})
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {upcoming.map((date) => {
              const tz              = date.school.timezone;
              const orderCount      = date._count.orders;
              const menuCount       = date.menuAvailability.length;
              const cutoffPassed    = new Date() >= date.cutoffAt;
              const effectivelyOpen = date.orderingOpen && !cutoffPassed;

              return (
                <details key={date.id} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                    {/* Calendar tile */}
                    <div style={{
                      flexShrink: 0, width: 44, height: 44, borderRadius: 12,
                      background: "#fff1f3", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <p style={{ fontSize: 8, fontWeight: 700, color: "#c41230", textTransform: "uppercase" }}>
                        {formatInTimeZone(date.deliveryDate, tz, "MMM")}
                      </p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: "#c41230", lineHeight: 1 }}>
                        {formatInTimeZone(date.deliveryDate, tz, "d")}
                      </p>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate">{date.school.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatInTimeZone(date.deliveryDate, tz, "EEEE")}
                        {date.notes ? ` · ${date.notes}` : ""}
                      </p>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {orderCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#15803d", borderRadius: 100, padding: "3px 10px" }}>
                          {orderCount} order{orderCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {menuCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#eff6ff", color: "#0369a1", borderRadius: 100, padding: "3px 8px" }}>
                          {menuCount} items
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: effectivelyOpen ? "#dcfce7" : cutoffPassed ? "#fef9c3" : "#f3f4f6",
                        color: effectivelyOpen ? "#15803d" : cutoffPassed ? "#854d0e" : "#6b7280",
                        borderRadius: 100, padding: "3px 10px",
                      }}>
                        {effectivelyOpen ? "Open" : cutoffPassed ? "Cutoff passed" : "Closed"}
                      </span>
                    </div>
                  </summary>

                  {/* Expanded body */}
                  <div className="border-t border-slate-50 px-4 py-3 space-y-3">
                    {/* Cutoff + toggle */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[11px] text-slate-500">
                          Cutoff: <span className="font-medium text-ink">
                            {formatInTimeZone(date.cutoffAt, tz, "EEE MMM d · h:mm a zzz")}
                          </span>
                        </p>
                        {orderCount > 0 && (
                          <div className="flex items-center gap-3">
                            <Link href={`/admin/orders?deliveryDateId=${date.id}`}
                              className="text-[11px] text-brand-700 font-medium no-underline hover:underline">
                              View {orderCount} order{orderCount !== 1 ? "s" : ""} →
                            </Link>
                            <a href={`/api/admin/labels?deliveryDateId=${date.id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-slate-500 font-medium no-underline hover:underline flex items-center gap-1">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                              </svg>
                              Labels
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {cutoffPassed ? (
                          <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Cutoff passed</span>
                        ) : (
                          <form action={toggleDateOpen}>
                            <input type="hidden" name="id" value={date.id} />
                            <button type="submit"
                              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                                date.orderingOpen
                                  ? "border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-700"
                                  : "border-brand-200 text-brand-700 hover:bg-brand-50"
                              }`}>
                              {date.orderingOpen ? "Close ordering" : "Open ordering"}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    {/* Menu items currently on this date */}
                    {date.menuAvailability.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Menu items on this date</p>
                        <div className="flex flex-wrap gap-1.5">
                          {date.menuAvailability.map((entry) => (
                            <span key={entry.id}
                              className="px-2.5 py-1 rounded-full text-[11px] bg-brand-50 text-brand-800 border border-brand-100">
                              {entry.menuItem.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attach / update menu items */}
                    <details className="rounded-lg border border-slate-100 overflow-hidden">
                      <summary className="px-3 py-2 text-[12px] text-brand-700 font-medium cursor-pointer list-none hover:bg-slate-50 transition">
                        {date.menuAvailability.length > 0 ? "Update menu items →" : "+ Attach menu items"}
                      </summary>
                      <form action={attachMenuItems} className="px-3 pb-3 border-t border-slate-50 pt-2 space-y-2">
                        <input type="hidden" name="deliveryDateId" value={date.id} />
                        <input type="hidden" name="schoolId" value={date.schoolId} />
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide pt-1">
                          Check items to include · set a qty cap (optional)
                        </p>
                        {(() => {
                          // Build a count map: menuItemId → # PAID orders on this date
                          const soldMap = new Map<string, number>();
                          for (const o of date.orders) {
                            for (const i of o.items) {
                              soldMap.set(i.menuItemId, (soldMap.get(i.menuItemId) ?? 0) + 1);
                            }
                          }
                          return (
                            <div className="space-y-1 max-h-56 overflow-y-auto py-1">
                              {menuItems
                                .filter(
                                  (item) =>
                                    item.schoolRestrictions.length === 0 ||
                                    item.schoolRestrictions.some((r) => r.schoolId === date.schoolId)
                                )
                                .map((item) => {
                                const existing = date.menuAvailability.find((a) => a.menuItemId === item.id);
                                const soldCount = soldMap.get(item.id) ?? 0;
                                const cap = (existing as { maxQuantity?: number | null } | undefined)?.maxQuantity ?? null;
                                const isSoldOut = cap !== null && soldCount >= cap;
                                return (
                                  <div key={item.id} className="flex items-center gap-2">
                                    <input type="checkbox" name="menuItemIds" value={item.id}
                                      defaultChecked={!!existing}
                                      className="rounded flex-shrink-0 accent-brand-700" />
                                    <span className="text-[12px] text-slate-700 flex-1 truncate">{item.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {soldCount > 0 && (
                                        <span style={{
                                          fontSize: 9, fontWeight: 700,
                                          background: isSoldOut ? "#fee2e2" : "#f0fdf4",
                                          color: isSoldOut ? "#b91c1c" : "#15803d",
                                          borderRadius: 100, padding: "1px 6px",
                                        }}>
                                          {soldCount} sold{isSoldOut ? " · SOLD OUT" : ""}
                                        </span>
                                      )}
                                      <input
                                        type="number"
                                        name={`maxQty_${item.id}`}
                                        defaultValue={cap ?? ""}
                                        min={1}
                                        placeholder="∞"
                                        style={{
                                          width: 48, fontSize: 11, textAlign: "center",
                                          borderRadius: 6, border: "1px solid #e2e8f0",
                                          padding: "2px 4px", color: "#475569",
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        <button type="submit"
                          className="w-full py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
                          Save menu items
                        </button>
                      </form>
                    </details>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {upcoming.length === 0 && (
        <div className="rounded-[14px] border border-slate-100 bg-white px-4 py-8 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <p className="text-[13px] font-medium text-slate-400">No upcoming delivery dates.</p>
          <p className="text-[11px] text-slate-300 mt-1">Expand &ldquo;Add delivery date&rdquo; above to create one.</p>
        </div>
      )}

      {/* ── Past dates ──────────────────────────────────────────────── */}
      {past.length > 0 && (
        <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
            <span className="text-[13px] font-semibold text-slate-500">Past dates ({past.length})</span>
            <span className="text-[11px] text-slate-400">tap to expand</span>
          </summary>
          <div className="border-t border-slate-50 divide-y divide-slate-50">
            {past.slice().reverse().map((date) => {
              const tz         = date.school.timezone;
              const orderCount = date._count.orders;
              return (
                <div key={date.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div style={{
                      flexShrink: 0, width: 36, height: 36, borderRadius: 10,
                      background: "#f3f4f6", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <p style={{ fontSize: 7, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                        {formatInTimeZone(date.deliveryDate, tz, "MMM")}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#6b7280", lineHeight: 1 }}>
                        {formatInTimeZone(date.deliveryDate, tz, "d")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-slate-600">{date.school.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatInTimeZone(date.deliveryDate, tz, "EEE, MMM d yyyy")}
                        {date.notes ? ` · ${date.notes}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {orderCount > 0 && (
                      <>
                        <Link href={`/admin/orders?deliveryDateId=${date.id}&archived=include`}
                          className="text-[11px] font-semibold no-underline"
                          style={{ color: "#6b7280" }}>
                          {orderCount} orders
                        </Link>
                        <a href={`/api/admin/labels?deliveryDateId=${date.id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[11px] font-medium no-underline hover:underline flex items-center gap-1"
                          style={{ color: "#94a3b8" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                          </svg>
                          Labels
                        </a>
                      </>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {date.menuAvailability.length} items
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
