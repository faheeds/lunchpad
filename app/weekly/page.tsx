import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireParent, requireParentTenant } from "@/lib/parent-auth";
import { getUpcomingOrderingWindowRange } from "@/lib/weekly-week";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { WeeklyPlanPlanner } from "@/components/account/weekly-plan-planner";
import { WeeklyCheckoutButton } from "@/components/account/weekly-checkout-button";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) redirect("/account/sign-in");
  const restaurant = await requireParentTenant(parentUserId, "/weekly");

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
          cancelledAt: null,
          cutoffAt: { gt: now },
          deliveryDate: { gte: range.start, lte: range.end },
          school: { isActive: true, restaurantId: restaurant.id }
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
      <SiteHeaderServer />
      <main className="app-content pb-32" id="main-content">
        <div className="px-4 py-4" style={{ maxWidth: 720, margin: "0 auto" }}>
          <p style={{ fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--brand-on-white)", marginBottom: 4 }}>Meal planning</p>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#211D15", marginBottom: 4, fontFamily: "Fraunces, Georgia, serif" }}>Weekly lunch plan</h1>
          <p style={{ fontSize: 14, color: "#938B78", lineHeight: 1.5, marginBottom: 16 }}>
            Plan a meal for each upcoming day — we&apos;ll bundle it into one checkout for the whole week.
          </p>

          <div style={{ borderRadius: 18, border: "1px solid #E3DBC6", background: "#FCFAF3", padding: 16 }}>
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
      <div className="fixed inset-x-0 bottom-[52px] z-20 px-4 pb-2" style={{ maxWidth: 960, margin: "0 auto", left: 0, right: 0 }}>
        <div style={{ borderRadius: 18, border: "1px solid #E3DBC6", background: "rgba(252,250,243,0.97)", backdropFilter: "blur(12px)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, maxWidth: 720, margin: "0 auto" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--brand-on-white)" }}>Upcoming week</p>
            <p style={{ fontSize: 14, color: "#938B78", marginTop: 2 }}>
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
