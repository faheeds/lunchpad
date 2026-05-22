import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { signOut } from "@/lib/auth";
import { requireParent, requireParentTenant } from "@/lib/parent-auth";
import { getUpcomingOrderingWindowRange } from "@/lib/weekly-week";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { SubmitButton } from "@/components/forms/submit-button";
import { GradeSelect } from "@/components/forms/grade-select";
import { WeeklyCheckoutButton } from "@/components/account/weekly-checkout-button";
import { WeeklyPlanPlanner } from "@/components/account/weekly-plan-planner";
import { getLabels } from "@/lib/location-labels";
import { getOrderStatusColors } from "@/lib/order-status-colors";

export default async function ParentAccountPage() {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) redirect("/account/sign-in");

  // Resolve the tenant. If we're on the apex (no x-restaurant-slug header)
  // this redirects the parent to their restaurant's subdomain so the rest
  // of the page can rely on a real Restaurant.
  const restaurant = await requireParentTenant(parentUserId, "/account");

  // ── Server actions ──────────────────────────────────────────────────────

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
      },
    });
    revalidatePath("/account");
    redirect("/account");
  }

  async function updateChild(formData: FormData) {
    "use server";
    const session = await requireParent();
    const parentUserId = session.user?.parentUserId;
    if (!parentUserId) redirect("/account/sign-in");
    await prisma.parentChild.updateMany({
      where: { id: String(formData.get("childId") || ""), parentUserId, archivedAt: null },
      data: {
        schoolId: String(formData.get("schoolId")),
        studentName: String(formData.get("studentName")),
        grade: String(formData.get("grade")),
        allergyNotes: String(formData.get("allergyNotes") || "") || null,
      },
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
      prisma.parentChild.update({ where: { id: childId }, data: { archivedAt: new Date() } }),
    ]);
    revalidatePath("/account");
    redirect("/account");
  }

  // ── Data ───────────────────────────────────────────────────────────────

  const [parent, schools, orders] = await Promise.all([
    prisma.parentUser.findUnique({
      where: { id: parentUserId },
      include: {
        children: {
          where: { archivedAt: null },
          include: { school: true },
          orderBy: { studentName: "asc" },
        },
        weeklyPlans: {
          where: { parentChild: { archivedAt: null } },
          include: { parentChild: true, menuItem: true, school: true },
          orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.school.findMany({ where: { isActive: true, restaurantId: restaurant.id }, orderBy: { name: "asc" } }),
    // Tenant-scoped: belt-and-braces. With per-tenant ParentUser records
    // a parent can only have orders at one restaurant, but filtering on
    // restaurantId here defends against any pre-migration data linkage
    // that survived the backfill (parent at A with stale orders at B, etc.)
    prisma.order.findMany({
      where: { parentUserId, restaurantId: restaurant.id, archivedAt: null },
      include: { school: true, deliveryDate: true, student: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  if (!parent) redirect("/account/sign-in");

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
          school: { isActive: true, restaurantId: restaurant.id },
        },
        include: {
          school: true,
          menuAvailability: {
            where: { isAvailable: true, menuItem: { is: { isActive: true } } },
            include: { menuItem: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
          },
        },
        orderBy: { deliveryDate: "asc" },
      })
    : [];

  const activeWeeklyPlanCount = parent.weeklyPlans.filter((p) => p.isActive).length;

  const initials = (name: string | null | undefined) =>
    (name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <SiteHeaderServer />
      <main className="app-content pb-36" id="main-content">
        <div className="px-4 py-4 space-y-5">

          {/* ── Profile header ─────────────────────────────────────── */}
          <div style={{
            background: `linear-gradient(135deg, #2C4031 0%, #1E2C22 100%)`,
            borderRadius: 18, padding: "20px",
          }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "rgba(var(--brand-rgb),0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, color: "var(--brand-on-dark)",
                  flexShrink: 0,
                }}>
                  {initials(parent.name)}
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{parent.name ?? getLabels(parent.children[0]?.school.locationType).orderer}</p>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{parent.email}</p>
                </div>
              </div>
              <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
                <button type="submit" style={{
                  fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.15)", borderRadius: 100,
                  padding: "6px 14px", background: "transparent", cursor: "pointer",
                }}>
                  Sign out
                </button>
              </form>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>{parent.children.length}</p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{getLabels(parent.children[0]?.school.locationType).unitPlural}</p>
              </div>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>{orders.filter((o) => o.status === "PAID").length}</p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Orders</p>
              </div>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>{activeWeeklyPlanCount}</p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Weekly</p>
              </div>
            </div>
          </div>

          {/* ── Saved kids ─────────────────────────────────────────── */}
          <section>
            <p style={{ fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#938B78", marginBottom: 8 }}>Your {getLabels(parent.children[0]?.school.locationType).unitPlural.toLowerCase()}</p>

            {parent.children.map((child) => (
              <div key={child.id} style={{ borderRadius: 18, border: "1px solid #E3DBC6", background: "#FCFAF3", marginBottom: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(var(--brand-rgb), 0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: "var(--brand-on-white)",
                  }}>
                    {child.studentName[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#211D15" }}>{child.studentName}</p>
                    <p style={{ fontSize: 14, color: "#938B78" }}>{child.school.name}{child.grade && getLabels(child.school.locationType).showGrade ? ` · ${getLabels(child.school.locationType).grade} ${child.grade}` : ""}</p>
                    {child.allergyNotes && (
                      <span style={{
                        display: "inline-block", marginTop: 4,
                        fontSize: 14, fontWeight: 700,
                        color: "#7C3D24", background: "#F4E3DB",
                        borderRadius: 100, padding: "2px 8px",
                      }}>
                        ⚠ {child.allergyNotes}
                      </span>
                    )}
                  </div>
                  <Link href={`/order?childId=${child.id}`} style={{
                    fontSize: 14, fontWeight: 700, color: "white",
                    background: "var(--brand-on-white)",
                    borderRadius: 100, padding: "7px 14px",
                    textDecoration: "none", flexShrink: 0,
                  }}>
                    Order
                  </Link>
                </div>
                <details style={{ borderTop: "1px solid #E3DBC6" }}>
                  <summary style={{ padding: "10px 16px", fontSize: 14, color: "#938B78", fontWeight: 500, cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit details
                  </summary>
                  <form action={updateChild} style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #E3DBC6" }}>
                    <input type="hidden" name="childId" value={child.id} />
                    <input name="studentName" defaultValue={child.studentName} placeholder={getLabels(child.school.locationType).unitName}
                      style={{ width: "100%", borderRadius: 12, border: "1px solid #E3DBC6", fontSize: 14, padding: "8px 12px" }} required />
                    <GradeSelect schools={schools} defaultSchoolId={child.schoolId} defaultGrade={child.grade} />
                    <input name="allergyNotes" defaultValue={child.allergyNotes ?? ""} placeholder="Allergy / dietary notes"
                      style={{ width: "100%", borderRadius: 12, border: "1px solid #E3DBC6", fontSize: 14, padding: "8px 12px" }} />
                    <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                      <SubmitButton label="Save changes" pendingLabel="Saving…" />
                      <form action={archiveChild}>
                        <input type="hidden" name="childId" value={child.id} />
                        <button type="submit" style={{
                          padding: "8px 14px", borderRadius: 10,
                          border: `1px solid rgba(var(--brand-rgb), 0.2)`, color: "var(--brand-on-white)",
                          fontSize: 14, fontWeight: 600, background: "transparent", cursor: "pointer",
                        }}>
                          Remove
                        </button>
                      </form>
                    </div>
                  </form>
                </details>
              </div>
            ))}

            {/* Add child */}
            <details style={{ borderRadius: 18, border: "1px dashed #E3DBC6", background: "#FCFAF3", overflow: "hidden" }}>
              <summary style={{ padding: "12px 16px", fontSize: 14, color: "#938B78", cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 12 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                Add {getLabels(schools[0]?.locationType).ordererRefersToUnit}
              </summary>
              <form action={addChild} style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #E3DBC6" }}>
                <input name="studentName" placeholder={getLabels(schools[0]?.locationType).unitName} required
                  style={{ width: "100%", borderRadius: 12, border: "1px solid #E3DBC6", fontSize: 14, padding: "8px 12px" }} />
                <GradeSelect schools={schools} />
                <input name="allergyNotes" placeholder="Allergy / dietary notes"
                  style={{ width: "100%", borderRadius: 12, border: "1px solid #E3DBC6", fontSize: 14, padding: "8px 12px" }} />
                <SubmitButton label={`Save ${getLabels(schools[0]?.locationType).unit.toLowerCase()}`} pendingLabel="Saving…" />
              </form>
            </details>
          </section>

          {/* ── Weekly plan ────────────────────────────────────────── */}
          {parent.children.length > 0 && (
            <section>
              <p style={{ fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#938B78", marginBottom: 8 }}>Weekly lunch plan</p>
              <div style={{ borderRadius: 18, border: "1px solid #E3DBC6", background: "#FCFAF3", padding: 16 }}>
                <p style={{ fontSize: 14, color: "#938B78", lineHeight: 1.5, marginBottom: 12 }}>
                  Set a default meal per weekday. One checkout covers the whole week.
                </p>
                <WeeklyPlanPlanner
                  children={parent.children.map((c) => ({
                    id: c.id,
                    schoolId: c.schoolId,
                    schoolName: c.school.name,
                    timezone: c.school.timezone,
                    studentName: c.studentName,
                    grade: c.grade,
                  }))}
                  deliveryDates={deliveryDates.map((date) => ({
                    id: date.id,
                    schoolId: date.schoolId,
                    deliveryDate: date.deliveryDate.toISOString(),
                    cutoffAt: date.cutoffAt.toISOString(),
                    school: { id: date.school.id, name: date.school.name, timezone: date.school.timezone },
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
                        priceDeltaCents: o.priceDeltaCents,
                      })),
                    })),
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
                    sortOrder: p.sortOrder,
                  }))}
                />
              </div>
            </section>
          )}

          {/* ── Order history ──────────────────────────────────────── */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#938B78" }}>Order history</p>
              {orders.length > 0 && (
                <Link href="/history" style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-on-white, #c41230)", textDecoration: "none" }}>
                  View all →
                </Link>
              )}
            </div>

            {orders.length ? orders.map((order) => {
              const s = getOrderStatusColors(order.status);
              return (
                <div key={order.id} style={{ borderRadius: 18, border: "1px solid #E3DBC6", background: "#FCFAF3", padding: 16, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "#211D15" }}>{order.student.studentName}</p>
                        <span style={{ fontSize: 14, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 100, padding: "2px 8px" }}>
                          {s.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, color: "#5B5446" }}>{order.items.map((i) => i.itemNameSnapshot).join(", ")}</p>
                      <p style={{ fontSize: 14, color: "#938B78", marginTop: 4 }}>
                        {order.school.name} · {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEE, MMM d")}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#211D15" }}>
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(order.totalCents / 100)}
                      </p>
                      {order.status === "PAID" && (
                        <Link href={`/order?reorder=${order.id}`} style={{
                          fontSize: 14, fontWeight: 600, color: "var(--brand-on-white)",
                          textDecoration: "none", display: "block", marginTop: 4,
                        }}>
                          Reorder →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div style={{ borderRadius: 18, border: "1px solid #E3DBC6", background: "#FCFAF3", padding: "32px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#938B78" }}>No orders yet.</p>
                <Link href="/order" style={{
                  display: "inline-block", marginTop: 10,
                  fontSize: 14, fontWeight: 700, color: "white",
                  background: "var(--brand-on-white)",
                  borderRadius: 100, padding: "9px 20px", textDecoration: "none",
                }}>
                  Order now
                </Link>
              </div>
            )}
          </section>

        </div>
      </main>

      {/* Sticky weekly checkout */}
      {activeWeeklyPlanCount > 0 && (
        <div className="fixed inset-x-0 bottom-[52px] z-20 px-4 pb-2 pointer-events-none"
          style={{ maxWidth: 480, margin: "0 auto", left: 0, right: 0 }}>
          <div style={{
            borderRadius: 18, border: "1px solid #E3DBC6",
            background: "rgba(252,250,243,0.97)", backdropFilter: "blur(12px)",
            padding: "12px 16px", boxShadow: "0 4px 20px rgba(33,29,21,0.12)",
          }} className="pointer-events-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--brand-on-white)" }}>
                Upcoming week
              </p>
              <p style={{ fontSize: 14, color: "#938B78", marginTop: 2 }}>
                {activeWeeklyPlanCount} planned item{activeWeeklyPlanCount === 1 ? "" : "s"} ready for checkout
              </p>
            </div>
            <WeeklyCheckoutButton label="Checkout week" fullWidth={false} />
          </div>
        </div>
      )}

      <AppNav />
    </>
  );
}
