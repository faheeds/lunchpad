import { revalidatePath } from "next/cache";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { deliveryDateSchema } from "@/lib/validation/order";

export const dynamic = "force-dynamic";

async function createDeliveryDate(formData: FormData) {
  "use server";
  const parsed = deliveryDateSchema.parse({
    schoolId: formData.get("schoolId"),
    deliveryDate: formData.get("deliveryDate"),
    cutoffAt: formData.get("cutoffAt"),
    orderingOpen: formData.get("orderingOpen") === "on",
    notes: formData.get("notes")
  });
  await prisma.deliveryDate.create({
    data: {
      schoolId: parsed.schoolId,
      deliveryDate: fromZonedTime(`${parsed.deliveryDate} 11:00:00`, "America/Los_Angeles"),
      cutoffAt: fromZonedTime(parsed.cutoffAt.replace("T", " ") + ":00", "America/Los_Angeles"),
      orderingOpen: parsed.orderingOpen,
      notes: parsed.notes || null
    }
  });
  revalidatePath("/admin/delivery-dates");
}

async function toggleDateOpen(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const current = await prisma.deliveryDate.findUnique({ where: { id }, select: { orderingOpen: true } });
  await prisma.deliveryDate.update({ where: { id }, data: { orderingOpen: !current?.orderingOpen } });
  revalidatePath("/admin/delivery-dates");
}

async function attachMenuItems(formData: FormData) {
  "use server";
  const deliveryDateId = String(formData.get("deliveryDateId"));
  const schoolId = String(formData.get("schoolId"));
  const submittedIds = new Set(formData.getAll("menuItemIds").map(String));

  // The submitted checkbox list is the authoritative state: any active menu
  // item in the set is available for this delivery date, everything else is
  // unavailable. Without this, unchecking + saving would leave stale
  // availability rows behind and the UI would re-render as still-checked.
  const activeMenuItems = await prisma.menuItem.findMany({
    where: { isActive: true },
    select: { id: true }
  });

  await prisma.$transaction(
    activeMenuItems.map((item) => {
      const shouldBeAvailable = submittedIds.has(item.id);
      return prisma.deliveryMenuItem.upsert({
        where: { deliveryDateId_menuItemId: { deliveryDateId, menuItemId: item.id } },
        update: { isAvailable: shouldBeAvailable },
        create: { deliveryDateId, menuItemId: item.id, schoolId, isAvailable: shouldBeAvailable }
      });
    })
  );

  revalidatePath("/admin/delivery-dates");
}

export default async function DeliveryDatesPage() {
  const [schools, deliveryDates, menuItems] = await Promise.all([
    prisma.school.findMany({ where: { isActive: true, slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }, orderBy: { name: "asc" } }),
    prisma.deliveryDate.findMany({
      where: { school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } } },
      include: {
        school: true,
        // Only surface available rows — unchecked items keep a row with
        // isAvailable=false so history is preserved, but the UI should treat
        // them as detached.
        menuAvailability: {
          where: { isAvailable: true },
          include: { menuItem: true }
        }
      },
      orderBy: { deliveryDate: "asc" }
    }),
    prisma.menuItem.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
  ]);

  // Group by upcoming vs past
  const now = new Date();
  const upcoming = deliveryDates.filter((d) => new Date(d.deliveryDate) >= now);
  const past = deliveryDates.filter((d) => new Date(d.deliveryDate) < now);

  return (
    <div className="space-y-4 pb-10">
      <h1 className="text-[17px] font-semibold text-ink">Delivery dates</h1>

      {/* Add date */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="text-[13px] font-semibold text-ink">+ Add delivery date</span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>
        <form action={createDeliveryDate} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-2">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">School</label>
            <select name="schoolId" className="w-full rounded-lg border-slate-200 text-[13px] py-2">
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Delivery date</label>
              <input type="date" name="deliveryDate" required className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Order cutoff</label>
              <input type="datetime-local" name="cutoffAt" required className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Notes (optional)</label>
            <input name="notes" placeholder="e.g. Last day before spring break" className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
            <input type="checkbox" name="orderingOpen" defaultChecked className="rounded" /> Open for ordering
          </label>
          <button type="submit" className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Create delivery date
          </button>
        </form>
      </details>

      {/* Upcoming dates */}
      {upcoming.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">Upcoming ({upcoming.length})</p>
          <div className="space-y-2">
            {upcoming.map((date) => (
              <details key={date.id} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-50 flex flex-col items-center justify-center">
                    <p className="text-[8px] font-semibold uppercase text-brand-600">
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "MMM")}
                    </p>
                    <p className="text-[16px] font-semibold text-brand-900 leading-none">
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "d")}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{date.school.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "EEEE")} &middot; {date.menuAvailability.length} items
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    date.orderingOpen ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-500"
                  }`}>
                    {date.orderingOpen ? "Open" : "Closed"}
                  </span>
                </summary>

                <div className="border-t border-slate-50 px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-500">
                      Cutoff: {formatInTimeZone(date.cutoffAt, date.school.timezone, "MMM d h:mm a zzz")}
                      {date.notes && <span> · {date.notes}</span>}
                    </p>
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
                  </div>

                  {/* Menu items on this date */}
                  {date.menuAvailability.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Menu items</p>
                      <div className="flex flex-wrap gap-1.5">
                        {date.menuAvailability.map((entry) => (
                          <span key={entry.id} className="px-2.5 py-1 rounded-full text-[11px] bg-brand-50 text-brand-800 border border-brand-100">
                            {entry.menuItem.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attach menu items */}
                  <details className="rounded-lg border border-slate-100 overflow-hidden">
                    <summary className="px-3 py-2 text-[12px] text-brand-700 font-medium cursor-pointer list-none">
                      + Attach more menu items
                    </summary>
                    <form action={attachMenuItems} className="px-3 pb-3 border-t border-slate-50 pt-2 space-y-2">
                      <input type="hidden" name="deliveryDateId" value={date.id} />
                      <input type="hidden" name="schoolId" value={date.schoolId} />
                      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                        {menuItems.map((item) => (
                          <label key={item.id} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer py-1">
                            <input type="checkbox" name="menuItemIds" value={item.id}
                              defaultChecked={date.menuAvailability.some((a) => a.menuItemId === item.id)}
                              className="rounded flex-shrink-0" />
                            <span className="truncate">{item.name}</span>
                          </label>
                        ))}
                      </div>
                      <button type="submit" className="w-full py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold">
                        Save menu items
                      </button>
                    </form>
                  </details>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Past dates - collapsed summary */}
      {past.length > 0 && (
        <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
            <span className="text-[13px] font-semibold text-slate-500">Past dates ({past.length})</span>
            <span className="text-[11px] text-slate-400">tap to expand</span>
          </summary>
          <div className="border-t border-slate-50 divide-y divide-slate-50">
            {past.slice().reverse().map((date) => (
              <div key={date.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-slate-600">{date.school.name}</p>
                  <p className="text-[11px] text-slate-400">{formatInTimeZone(date.deliveryDate, date.school.timezone, "EEE, MMM d yyyy")}</p>
                </div>
                <span className="text-[10px] text-slate-400">{date.menuAvailability.length} items</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
