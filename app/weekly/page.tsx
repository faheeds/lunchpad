import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireParent } from "@/lib/parent-auth";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { getUpcomingOrderingWindowRange } from "@/lib/weekly-week";
import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";
import { WeeklyPlanPlanner } from "@/components/account/weekly-plan-planner";
import { WeeklyCheckoutButton } from "@/components/account/weekly-checkout-button";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) redirect("/account/sign-in");

  const parent = await prisma.parentUser.findUnique({
    where: { id: parentUserId },
    include: {
      children: {
        where: { archivedAt: null },
        include: { school: true },
        orderBy: { studentName: "asc" }
      },
      weeklyPlans: {
        where: { parentChild: { archivedAt: null } },
        include: { parentChild: true, menuItem: true, school: true },
        orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!parent) redirect("/account/sign-in");

  // Load upcoming delivery dates per the child's schools, constrained to the
  // ordering window (today through next Friday). This mirrors the single-day
  // order flow so the planner only offers weekdays that are actually bookable.
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

  return (
    <>
      <SiteHeader />
      <main className="app-content pb-32">
        <div className="px-4 py-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-700 mb-0.5">Meal planning</p>
          <h1 className="text-[20px] font-semibold text-ink mb-1">Weekly lunch plan</h1>
          <p className="text-[12px] text-slate-500 leading-relaxed mb-4">
            Plan a meal for each upcoming day — we&apos;ll bundle it into one checkout for the whole week.
          </p>

          <div className="rounded-[18px] border border-slate-100 bg-white p-4">
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
        </div>
      </main>

      {/* Sticky checkout bar */}
      <div className="fixed inset-x-0 bottom-[52px] z-20 px-4 pb-2" style={{ maxWidth: 480, margin: "0 auto", left: 0, right: 0 }}>
        <div className="rounded-[18px] border border-brand-200 bg-white/97 backdrop-blur px-4 py-3 shadow-soft flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-700">Upcoming week</p>
            <p className="text-[12px] text-slate-600 mt-0.5">
              {activeWeeklyPlanCount
                ? `${activeWeeklyPlanCount} planned item${activeWeeklyPlanCount === 1 ? "" : "s"} ready for checkout`
                : "Add items to your week plan"}
            </p>
          </div>
          <WeeklyCheckoutButton label="Checkout week" fullWidth={false} />
        </div>
      </div>
      <AppNav />
    </>
  );
}
