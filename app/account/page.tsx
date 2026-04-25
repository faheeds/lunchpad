import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { signOut } from "@/lib/auth";
import { requireParent } from "@/lib/parent-auth";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { getUpcomingOrderingWindowRange } from "@/lib/weekly-week";
import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";
import { SubmitButton } from "@/components/forms/submit-button";
import { GradeSelect } from "@/components/forms/grade-select";
import { WeeklyCheckoutButton } from "@/components/account/weekly-checkout-button";
import { WeeklyPlanPlanner } from "@/components/account/weekly-plan-planner";
import { Badge } from "@/components/ui";

export default async function ParentAccountPage() {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) redirect("/account/sign-in");

  async function addChild(formData: FormData) {
    "use server";
    const session = await requireParent();
    const parentUserId = session.user?.parentUserId;
    if (!parentUserId) redirect("/account/sign-in");
    await prisma.parentChild.create({
      data: {
        parentUserId,
        schoolId: String(formData.get("schoolId")),
        studentName: String(formData.get("studentName")),
        grade: String(formData.get("grade")),
        allergyNotes: String(formData.get("allergyNotes") || "") || null,
      }
    });
    revalidatePath("/account");
    redirect("/account");
  }

  async function updateChild(formData: FormData) {
    "use server";
    const session = await requireParent();
    const parentUserId = session.user?.parentUserId;
    if (!parentUserId) redirect("/account/sign-in");
    const childId = String(formData.get("childId") || "");
    await prisma.parentChild.updateMany({
      where: { id: childId, parentUserId, archivedAt: null },
      data: {
        schoolId: String(formData.get("schoolId")),
        studentName: String(formData.get("studentName")),
        grade: String(formData.get("grade")),
        allergyNotes: String(formData.get("allergyNotes") || "") || null,
      }
    });
    revalidatePath("/account");
    redirect("/account");
  }

  async function archiveChild(formData: FormData) {
    "use server";
    const session = await requireParent();
    const parentUserId = session.user?.parentUserId;
    if (!parentUserId) redirect("/account/sign-in");
    const childId = String(formData.get("childId") || "");
    const child = await prisma.parentChild.findFirst({ where: { id: childId, parentUserId, archivedAt: null } });
    if (!child) { revalidatePath("/account"); redirect("/account"); }
    await prisma.$transaction([
      prisma.weeklyLunchPlan.deleteMany({ where: { parentUserId, parentChildId: childId } }),
      prisma.parentChild.update({ where: { id: childId }, data: { archivedAt: new Date() } })
    ]);
    revalidatePath("/account");
    redirect("/account");
  }

  const [parent, schools, orders] = await Promise.all([
    prisma.parentUser.findUnique({
      where: { id: parentUserId },
      include: {
        children: { where: { archivedAt: null }, include: { school: true }, orderBy: { studentName: "asc" } },
        weeklyPlans: {
          where: { parentChild: { archivedAt: null } },
          include: { parentChild: true, menuItem: true, school: true },
          orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    }),
    prisma.school.findMany({ where: { isActive: true, slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }, orderBy: { name: "asc" } }),
    prisma.order.findMany({
      where: { parentUserId, archivedAt: null },
      include: { school: true, deliveryDate: true, student: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  if (!parent) redirect("/account/sign-in");

  // Mirror the /weekly page's delivery-date load so the inline planner only
  // offers weekdays that actually have an open, pre-cutoff delivery.
  const now = new Date();
  const primaryTimezone = parent.children[0]?.school.timezone ?? "America/Los_Angeles";
  const range = getUpcomingOrderingWindowRange(now, primaryTimezone);
  const schoolIds = [...new Set(parent.children.map((c) => c.schoolId))];
  const deliveryDates = schoolIds.length
    ? await prisma.deliveryDate.findMany({
        where: {
          schoolId: { in: schoolIds },
          orderingOpen: true,
          cutoffAt: { gt: now },
          deliveryDate: { gte: range.start, lte: range.end },
          school: { isActive: true, slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }
        },
        include: {
          school: true,
          menuAvailability: {
            where: { isAvailable: true, menuItem: { is: { isActive: true } } },
            include: {
              menuItem: {
                include: { options: { orderBy: { sortOrder: "asc" } } }
              }
            }
          }
        },
        orderBy: { deliveryDate: "asc" }
      })
    : [];

  const activeWeeklyPlanCount = parent.weeklyPlans.filter((p) => p.isActive).length;

  const statusVariant = (status: string): "green" | "amber" | "red" | "gray" => {
    if (status === "PAID") return "green";
    if (status === "PENDING") return "amber";
    if (status === "REFUNDED" || status === "CANCELLED") return "red";
    return "gray";
  };

  return (
    <>
      <SiteHeader />
      <main className="app-content pb-36">
        <div className="px-4 py-4 space-y-4">

          {/* Profile */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-[14px] font-semibold text-brand-900">
                {parent.name?.slice(0, 2).toUpperCase() ?? "??"}
              </div>
              <div>
                <p className="text-[15px] font-semibold text-ink">{parent.name ?? "Parent"}</p>
                <p className="text-[11px] text-slate-500">{parent.email}</p>
              </div>
            </div>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <button type="submit" className="text-[11px] border border-slate-200 rounded-full px-3 py-1.5 text-slate-600">
                Sign out
              </button>
            </form>
          </div>

          {/* Saved children */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Saved children</p>
            {parent.children.length ? parent.children.map((child) => (
              <div key={child.id} className="rounded-[18px] border border-slate-100 bg-white mb-2 overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-[13px] font-semibold text-brand-900 flex-shrink-0">
                    {child.studentName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink">{child.studentName}</p>
                    <p className="text-[11px] text-slate-500">{child.school.name} · Grade {child.grade}</p>
                    {child.allergyNotes && (
                      <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">{child.allergyNotes}</span>
                    )}
                  </div>
                </div>
                <details className="border-t border-slate-50">
                  <summary className="px-4 py-2.5 text-[12px] text-brand-700 font-medium cursor-pointer list-none">Edit details</summary>
                  <form action={updateChild} className="px-4 pb-4 space-y-2">
                    <input type="hidden" name="childId" value={child.id} />
                    <input name="studentName" defaultValue={child.studentName} placeholder="Name" className="w-full rounded-xl border-slate-200 text-[13px]" required />
                    <GradeSelect
                      schools={schools}
                      defaultSchoolId={child.schoolId}
                      defaultGrade={child.grade}
                    />
                    <input name="allergyNotes" defaultValue={child.allergyNotes ?? ""} placeholder="Allergy notes" className="w-full rounded-xl border-slate-200 text-[13px]" />
                    <div className="flex gap-2 pt-1">
                      <SubmitButton label="Save changes" pendingLabel="Saving..." />
                      <form action={archiveChild}>
                        <input type="hidden" name="childId" value={child.id} />
                        <button type="submit" className="px-3 py-2 rounded-xl border border-red-200 text-[12px] text-red-700">Remove</button>
                      </form>
                    </div>
                  </form>
                </details>
              </div>
            )) : (
              <p className="text-[12px] text-slate-500 bg-slate-50 rounded-xl px-4 py-3">No saved children yet. Add one below.</p>
            )}
            <details className="rounded-[18px] border border-dashed border-slate-200 overflow-hidden">
              <summary className="px-4 py-3 text-[12px] text-slate-600 cursor-pointer list-none flex items-center gap-1.5">
                <span className="text-base">+</span> Add a child
              </summary>
              <form action={addChild} className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
                <input name="studentName" placeholder="Student name" className="w-full rounded-xl border-slate-200 text-[13px]" required />
                <GradeSelect schools={schools} />
                <input name="allergyNotes" placeholder="Allergy notes" className="w-full rounded-xl border-slate-200 text-[13px]" />
                <SubmitButton label="Save child" pendingLabel="Saving..." />
              </form>
            </details>
          </section>

          {/* Weekly planner */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Weekly lunch plan</p>
            <div className="rounded-[18px] border border-slate-100 bg-white p-4">
              <p className="text-[12px] text-slate-500 leading-relaxed mb-3">
                Set a default meal per weekday. One checkout covers the whole week.
              </p>
              <WeeklyPlanPlanner
                children={parent.children.map((c) => ({
                  id: c.id,
                  schoolId: c.schoolId,
                  schoolName: c.school.name,
                  timezone: c.school.timezone,
                  studentName: c.studentName,
                  grade: c.grade
                }))}
                deliveryDates={deliveryDates.map((date) => ({
                  id: date.id,
                  schoolId: date.schoolId,
                  deliveryDate: date.deliveryDate.toISOString(),
                  cutoffAt: date.cutoffAt.toISOString(),
                  school: {
                    id: date.school.id,
                    name: date.school.name,
                    timezone: date.school.timezone
                  },
                  menuItems: date.menuAvailability.map((entry) => ({
                    id: entry.menuItem.id,
                    slug: entry.menuItem.slug,
                    name: entry.menuItem.name,
                    description: entry.menuItem.description,
                    basePriceCents: entry.menuItem.basePriceCents,
                    options: entry.menuItem.options.map((o) => ({
                      id: o.id,
                      name: o.name,
                      optionType: o.optionType,
                      priceDeltaCents: o.priceDeltaCents
                    }))
                  }))
                }))}
                existingPlans={parent.weeklyPlans.map((p) => ({
                  id: p.id,
                  parentChildId: p.parentChildId,
                  weekday: p.weekday,
                  menuItemId: p.menuItemId,
                  menuItemName: p.menuItem.name,
                  choice: p.choice,
                  additions: p.additions,
                  removals: p.removals,
                  isActive: p.isActive,
                  sortOrder: p.sortOrder
                }))}
              />
            </div>
          </section>

          {/* Recent orders */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Recent orders</p>
            {orders.length ? orders.map((order) => (
              <div key={order.id} className="rounded-[18px] border border-slate-100 bg-white p-4 mb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink">{order.student.studentName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{order.items.map((i) => i.itemNameSnapshot).join(", ")}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {order.school.name} · {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEE, MMM d")}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
                    <p className="text-[13px] font-semibold text-ink mt-1">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(order.totalCents / 100)}
                    </p>
                    <Link href={`/order?reorder=${order.id}`} className="text-[11px] text-brand-700 font-medium mt-1 block no-underline">
                      Reorder →
                    </Link>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-[12px] text-slate-500 bg-slate-50 rounded-xl px-4 py-3">No orders yet.</p>
            )}
          </section>

        </div>
      </main>

      {/* Sticky weekly checkout */}
      <div className="fixed inset-x-0 bottom-[52px] z-20 px-4 pb-2 pointer-events-none" style={{ maxWidth: 480, margin: "0 auto", left: 0, right: 0 }}>
        <div className="rounded-[18px] border border-brand-200 bg-white/97 backdrop-blur px-4 py-3 shadow-soft pointer-events-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-700">Upcoming week</p>
            <p className="text-[12px] text-slate-600 mt-0.5">
              {activeWeeklyPlanCount ? `${activeWeeklyPlanCount} planned item${activeWeeklyPlanCount === 1 ? "" : "s"} ready for checkout` : "Add items to your week plan"}
            </p>
          </div>
          <WeeklyCheckoutButton label="Checkout week" fullWidth={false} />
        </div>
      </div>

      <AppNav />
    </>
  );
}
