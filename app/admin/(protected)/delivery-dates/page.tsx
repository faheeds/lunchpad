import { revalidatePath } from "next/cache";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ScheduleTabs } from "@/components/admin/schedule-tabs";
import { EmptyState } from "@/components/admin/empty-state";

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

async function generateRecurringSchedule(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const schoolId = String(formData.get("schoolId") || "");
  const startDateStr = String(formData.get("startDate") || "");
  const endDateStr = String(formData.get("endDate") || "");
  const weekdays = formData.getAll("weekdays").map((v) => parseInt(String(v), 10)).filter((n) => !isNaN(n));
  const cutoffDaysBefore = parseInt(String(formData.get("cutoffDaysBefore") || "1"), 10);
  const cutoffHour = parseInt(String(formData.get("cutoffHour") || "9"), 10);
  const cutoffMinute = parseInt(String(formData.get("cutoffMinute") || "0"), 10);
  const skipHolidays = formData.get("skipHolidays") === "on";
  const orderingOpen = formData.get("orderingOpen") === "on";

  if (!schoolId || !startDateStr || !endDateStr || weekdays.length === 0) return;

  const school = await prisma.school.findFirst({
    where: { id: schoolId, restaurantId: restaurant.id },
    select: { timezone: true },
  });
  if (!school) return;

  // US federal holidays (rough common-case list — operators can delete generated
  // dates that fall on local holidays not in this list).
  const US_HOLIDAYS_2025_2027: ReadonlySet<string> = new Set([
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-05-26", "2025-06-19",
    "2025-07-04", "2025-09-01", "2025-10-13", "2025-11-11", "2025-11-27", "2025-12-25",
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
    "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18",
    "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24",
  ]);

  // Walk the date range day-by-day in UTC and emit dates whose weekday matches.
  // We use UTC walking + zone conversion so we don't double-shift across DST.
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  if (end < start) return;

  const activeMenuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true, schoolRestrictions: { select: { schoolId: true } } },
  });
  const eligibleMenuItems = activeMenuItems.filter(
    (item) =>
      item.schoolRestrictions.length === 0 ||
      item.schoolRestrictions.some((r) => r.schoolId === schoolId)
  );

  const targetWeekdays = new Set(weekdays); // 0 = Sunday … 6 = Saturday
  const created: { id: string }[] = [];

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay();
    if (!targetWeekdays.has(weekday)) continue;

    const ymd = d.toISOString().slice(0, 10); // YYYY-MM-DD
    if (skipHolidays && US_HOLIDAYS_2025_2027.has(ymd)) continue;

    // Cutoff = (delivery date − cutoffDaysBefore) at HH:MM in school's timezone.
    const cutoffWalk = new Date(d);
    cutoffWalk.setUTCDate(cutoffWalk.getUTCDate() - cutoffDaysBefore);
    const cutoffYmd = cutoffWalk.toISOString().slice(0, 10);
    const hh = String(cutoffHour).padStart(2, "0");
    const mm = String(cutoffMinute).padStart(2, "0");

    try {
      const created_date = await prisma.deliveryDate.create({
        data: {
          schoolId,
          deliveryDate: fromZonedTime(`${ymd} 11:00:00`, school.timezone),
          cutoffAt: fromZonedTime(`${cutoffYmd} ${hh}:${mm}:00`, school.timezone),
          orderingOpen,
        },
      });
      created.push({ id: created_date.id });

      if (eligibleMenuItems.length > 0) {
        await prisma.deliveryMenuItem.createMany({
          data: eligibleMenuItems.map((m) => ({
            deliveryDateId: created_date.id,
            menuItemId: m.id,
            schoolId,
            isAvailable: true,
          })),
          skipDuplicates: true,
        });
      }
    } catch {
      // Most likely a duplicate (schoolId + deliveryDate unique) — skip silently.
    }
  }

  revalidatePath("/admin/delivery-dates");
}

async function cancelDeliveryDate(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim() || null;
  if (!id) return;

  // Tenant-scoped: verify the date belongs to this restaurant.
  const date = await prisma.deliveryDate.findFirst({
    where: { id, school: { restaurantId: restaurant.id } },
    include: {
      orders: {
        where: { status: "PAID", archivedAt: null },
        select: { id: true },
      },
    },
  });
  if (!date) throw new Error("Delivery date not found");
  if (date.cancelledAt) return; // already cancelled — idempotent

  // Refund every PAID order tied to this date. Reuse the admin cancel-with-
  // refund helper so the Stripe refund + order-state update + email logging
  // all happen the same way as a manual cancel.
  const { adminCancelOrderWithRefund } = await import("@/lib/admin");
  for (const o of date.orders) {
    try {
      await adminCancelOrderWithRefund(restaurant.id, o.id);
    } catch (e) {
      // Log and keep going — partial cancellation is better than aborting halfway.
      console.error(`[cancel-date] order ${o.id} refund failed:`, e instanceof Error ? e.message : e);
    }
  }

  // Soft-delete the date. orderingOpen=false so it disappears from any
  // surface that already filters by that flag.
  await prisma.deliveryDate.update({
    where: { id },
    data: {
      cancelledAt: new Date(),
      cancelledReason: reason,
      orderingOpen: false,
    },
  });

  revalidatePath("/admin/delivery-dates");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/dashboard");
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
    <div className="bg-editorial-paper min-h-screen space-y-5 pb-10">

      <ScheduleTabs active="dates" />

      {/* ── Add delivery date ───────────────────────────────────────── */}
      <details className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-editorial-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-green">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>
            </svg>
            Add delivery date
          </span>
          <span className="text-[11px] text-editorial-ink-faint">tap to expand</span>
        </summary>

        <form action={createDeliveryDate} className="px-4 pb-4 border-t border-editorial-line pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Location</label>
              <select name="schoolId" required
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                <option value="">Select location…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Delivery date</label>
              <input type="date" name="deliveryDate" required
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Ordering closes at</label>
              <input type="datetime-local" name="cutoffAt" required
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
              <p className="text-[10px] text-editorial-ink-faint mt-1">In the school&apos;s timezone</p>
            </div>
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Notes <span className="font-normal text-editorial-ink-faint">(optional)</span></label>
              <input type="text" name="notes" placeholder="e.g. Pizza day!"
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-editorial-ink-soft cursor-pointer">
            <input type="checkbox" name="orderingOpen" defaultChecked className="rounded" />
            Open for ordering immediately
          </label>
          <button type="submit"
            className="w-full py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
            Create delivery date
          </button>
        </form>
      </details>

      {/* ── Generate recurring schedule ─────────────────────────────── */}
      <details className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-editorial-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-green">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/>
            </svg>
            Generate recurring schedule
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-editorial-sage text-editorial-green">New</span>
          </span>
          <span className="text-[11px] text-editorial-ink-faint">tap to expand</span>
        </summary>

        <form action={generateRecurringSchedule} className="px-4 pb-4 border-t border-editorial-line pt-3 space-y-4">
          <p className="text-[12px] text-editorial-ink-soft leading-relaxed">
            Generate every Monday/Wednesday/Friday for the semester in one click. Auto-attaches active menu items and skips US federal holidays if you choose.
          </p>

          <div>
            <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Location</label>
            <select name="schoolId" required
              className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
              <option value="">Select location…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">From</label>
              <input type="date" name="startDate" required
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
            </div>
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Through</label>
              <input type="date" name="endDate" required
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">On these weekdays</label>
            <div className="grid grid-cols-7 gap-1.5">
              {[
                { v: 1, l: "Mon", on: true },
                { v: 2, l: "Tue", on: false },
                { v: 3, l: "Wed", on: true },
                { v: 4, l: "Thu", on: false },
                { v: 5, l: "Fri", on: true },
                { v: 6, l: "Sat", on: false },
                { v: 0, l: "Sun", on: false },
              ].map((d) => (
                <label key={d.v}
                  className="flex flex-col items-center justify-center cursor-pointer rounded-lg border border-editorial-line py-2 has-[:checked]:bg-editorial-green has-[:checked]:text-editorial-paper has-[:checked]:border-editorial-green transition">
                  <input type="checkbox" name="weekdays" value={d.v} defaultChecked={d.on} className="sr-only" />
                  <span className="text-[11px] font-semibold">{d.l}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Cutoff</label>
              <select name="cutoffDaysBefore" defaultValue="1"
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                <option value="0">Same day</option>
                <option value="1">1 day before</option>
                <option value="2">2 days before</option>
                <option value="3">3 days before</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Cutoff hour</label>
              <select name="cutoffHour" defaultValue="9"
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">Minute</label>
              <select name="cutoffMinute" defaultValue="0"
                className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                <option value="0">:00</option>
                <option value="15">:15</option>
                <option value="30">:30</option>
                <option value="45">:45</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[12px] text-editorial-ink-soft cursor-pointer">
              <input type="checkbox" name="skipHolidays" defaultChecked className="rounded" />
              Skip US federal holidays
            </label>
            <label className="flex items-center gap-2 text-[12px] text-editorial-ink-soft cursor-pointer">
              <input type="checkbox" name="orderingOpen" defaultChecked className="rounded" />
              Open all generated dates for ordering immediately
            </label>
          </div>

          <button type="submit"
            className="w-full py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
            Generate dates
          </button>
          <p className="text-[10px] text-editorial-ink-faint text-center">
            Existing dates won&apos;t be duplicated. Review the generated dates below and remove any you don&apos;t want.
          </p>
        </form>
      </details>

      {/* ── Upcoming dates ──────────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-editorial-ink-faint mb-2">
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
                <details key={date.id} className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                    {/* Calendar tile */}
                    <div style={{
                      flexShrink: 0, width: 44, height: 44, borderRadius: 12,
                      background: "#DEE2CF", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <p style={{ fontSize: 8, fontWeight: 700, color: "#2C4031", textTransform: "uppercase" }}>
                        {formatInTimeZone(date.deliveryDate, tz, "MMM")}
                      </p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: "#2C4031", lineHeight: 1 }}>
                        {formatInTimeZone(date.deliveryDate, tz, "d")}
                      </p>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-editorial-ink truncate">{date.school.name}</p>
                      <p className="text-[11px] text-editorial-ink-faint">
                        {formatInTimeZone(date.deliveryDate, tz, "EEEE")}
                        {date.notes ? ` · ${date.notes}` : ""}
                      </p>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {orderCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#DEE2CF", color: "#2C4031", borderRadius: 100, padding: "3px 10px" }}>
                          {orderCount} order{orderCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {menuCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, background: "#EFE8D7", color: "#211D15", borderRadius: 100, padding: "3px 8px" }}>
                          {menuCount} items
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: effectivelyOpen ? "#DEE2CF" : cutoffPassed ? "#F6EED9" : "#EFE8D7",
                        color: effectivelyOpen ? "#2C4031" : cutoffPassed ? "#6E5C2C" : "#5B5446",
                        borderRadius: 100, padding: "3px 10px",
                      }}>
                        {effectivelyOpen ? "Open" : cutoffPassed ? "Cutoff passed" : "Closed"}
                      </span>
                    </div>
                  </summary>

                  {/* Expanded body */}
                  <div className="border-t border-editorial-line px-4 py-3 space-y-3">
                    {/* Cutoff + toggle */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[11px] text-editorial-ink-soft">
                          Cutoff: <span className="font-medium text-editorial-ink">
                            {formatInTimeZone(date.cutoffAt, tz, "EEE MMM d · h:mm a zzz")}
                          </span>
                        </p>
                        {orderCount > 0 && (
                          <div className="flex items-center gap-3">
                            <Link href={`/admin/orders?deliveryDateId=${date.id}`}
                              className="text-[11px] text-editorial-green font-medium no-underline hover:underline">
                              View {orderCount} order{orderCount !== 1 ? "s" : ""} →
                            </Link>
                            <a href={`/api/admin/labels?deliveryDateId=${date.id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-editorial-ink-soft font-medium no-underline hover:underline flex items-center gap-1">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                              </svg>
                              Labels
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0 flex-wrap">
                        {cutoffPassed ? (
                          <span style={{ fontSize: 11, color: "#938B78", fontStyle: "italic" }}>Cutoff passed</span>
                        ) : (
                          <form action={toggleDateOpen}>
                            <input type="hidden" name="id" value={date.id} />
                            <button type="submit"
                              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                                date.orderingOpen
                                  ? "border-editorial-line text-editorial-ink-soft hover:border-editorial-green hover:text-editorial-green"
                                  : "border-editorial-line text-editorial-ink-soft hover:bg-editorial-paper-2"
                              }`}>
                              {date.orderingOpen ? "Close ordering" : "Open ordering"}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    {/* ── Cancel this date ─────────────────────────────────── */}
                    <details className="rounded-lg border border-[#E2C3B3] bg-[#F4E3DB] overflow-hidden">
                      <summary className="px-3 py-2 text-[11px] text-[#7C3D24] font-semibold cursor-pointer list-none flex items-center gap-1.5 hover:bg-[#F1D9CC] transition">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        Cancel this delivery date
                      </summary>
                      <form action={cancelDeliveryDate} className="px-3 pb-3 border-t border-[#E2C3B3] pt-3 space-y-2">
                        <input type="hidden" name="id" value={date.id} />
                        {orderCount > 0 ? (
                          <div className="rounded-lg border border-[#E2C3B3] bg-white px-3 py-2.5">
                            <p className="text-[12px] font-bold text-[#7C3D24] mb-1">⚠ This date has {orderCount} paid order{orderCount !== 1 ? "s" : ""}.</p>
                            <p className="text-[11px] text-[#7C3D24] leading-relaxed">
                              Cancelling will issue a Stripe refund for every order, set them all to CANCELLED, and notify customers by email.
                              The date will be hidden from the parent ordering page. This <strong>cannot be undone</strong>.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-editorial-ink-soft">No orders on this date — cancelling just removes it from the schedule.</p>
                        )}
                        <div>
                          <label className="text-[10px] text-editorial-ink-soft font-semibold uppercase tracking-wide block mb-1">Reason (optional)</label>
                          <input
                            type="text"
                            name="reason"
                            placeholder="e.g. Snow day, school closure"
                            className="w-full rounded-lg border border-editorial-line text-[12px] px-3 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <ConfirmButton
                            className="px-3 py-1.5 rounded-lg bg-[#7C3D24] text-white text-[11px] font-semibold hover:bg-[#6B3420] transition"
                            message={
                              orderCount > 0
                                ? `Cancel this delivery date and refund ${orderCount} paid order${orderCount !== 1 ? "s" : ""}? This cannot be undone.`
                                : "Cancel this delivery date? It will be removed from the schedule."
                            }
                          >
                            {orderCount > 0
                              ? `Refund ${orderCount} order${orderCount !== 1 ? "s" : ""} & cancel`
                              : "Cancel this date"}
                          </ConfirmButton>
                        </div>
                      </form>
                    </details>

                    {/* Menu items currently on this date */}
                    {date.menuAvailability.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-editorial-ink-faint mb-1.5">Menu items on this date</p>
                        <div className="flex flex-wrap gap-1.5">
                          {date.menuAvailability.map((entry) => (
                            <span key={entry.id}
                              className="px-2.5 py-1 rounded-full text-[11px] bg-editorial-paper-2 text-editorial-ink border border-editorial-line">
                              {entry.menuItem.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attach / update menu items */}
                    <details className="rounded-lg border border-editorial-line overflow-hidden">
                      <summary className="px-3 py-2 text-[12px] text-editorial-green font-medium cursor-pointer list-none hover:bg-editorial-paper-2 transition">
                        {date.menuAvailability.length > 0 ? "Update menu items →" : "+ Attach menu items"}
                      </summary>
                      <form action={attachMenuItems} className="px-3 pb-3 border-t border-editorial-line pt-2 space-y-2">
                        <input type="hidden" name="deliveryDateId" value={date.id} />
                        <input type="hidden" name="schoolId" value={date.schoolId} />
                        <p className="text-[10px] text-editorial-ink-faint font-medium uppercase tracking-wide pt-1">
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
                                      className="rounded flex-shrink-0 accent-editorial-green" />
                                    <span className="text-[12px] text-editorial-ink flex-1 truncate">{item.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {soldCount > 0 && (
                                        <span style={{
                                          fontSize: 9, fontWeight: 700,
                                          background: isSoldOut ? "#F4E3DB" : "#DEE2CF",
                                          color: isSoldOut ? "#7C3D24" : "#2C4031",
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
                                          borderRadius: 6, border: "1px solid #E3DBC6",
                                          padding: "2px 4px", color: "#5B5446",
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
                          className="w-full py-2 rounded-lg bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
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
        <EmptyState
          icon="calendar"
          title="No upcoming delivery dates."
          description='Expand "Add delivery date" above to create one.'
        />
      )}

      {/* ── Past dates ──────────────────────────────────────────────── */}
      {past.length > 0 && (
        <details className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
            <span className="text-[13px] font-semibold text-editorial-ink-soft">Past dates ({past.length})</span>
            <span className="text-[11px] text-editorial-ink-faint">tap to expand</span>
          </summary>
          <div className="border-t border-editorial-line divide-y divide-editorial-line">
            {past.slice().reverse().map((date) => {
              const tz         = date.school.timezone;
              const orderCount = date._count.orders;
              return (
                <div key={date.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div style={{
                      flexShrink: 0, width: 36, height: 36, borderRadius: 10,
                      background: "#EFE8D7", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <p style={{ fontSize: 7, fontWeight: 700, color: "#938B78", textTransform: "uppercase" }}>
                        {formatInTimeZone(date.deliveryDate, tz, "MMM")}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#5B5446", lineHeight: 1 }}>
                        {formatInTimeZone(date.deliveryDate, tz, "d")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-editorial-ink-soft">{date.school.name}</p>
                      <p className="text-[11px] text-editorial-ink-faint">
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
                          style={{ color: "#938B78" }}>
                          {orderCount} orders
                        </Link>
                        <a href={`/api/admin/labels?deliveryDateId=${date.id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[11px] font-medium no-underline hover:underline flex items-center gap-1"
                          style={{ color: "#938B78" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                          </svg>
                          Labels
                        </a>
                      </>
                    )}
                    <span className="text-[10px] text-editorial-ink-faint">
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
