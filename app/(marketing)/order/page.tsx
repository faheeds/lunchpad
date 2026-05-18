import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { getCurrentRestaurant, requireRestaurant } from "@/lib/restaurant";
import { requireParentTenant } from "@/lib/parent-auth";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { OrderForm } from "@/components/forms/order-form";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  searchParams
}: {
  searchParams: Promise<{ reorder?: string; item?: string; childId?: string }>;
}) {
  const t = await getTranslations();
  const session = await auth();
  // If a parent is on the apex (no slug header), bounce them to their
  // tenant subdomain instead of throwing.
  const tenantFromHeader = await getCurrentRestaurant();
  let restaurant;
  if (tenantFromHeader) {
    restaurant = tenantFromHeader;
  } else if (session?.user?.role === "PARENT" && session.user.parentUserId) {
    restaurant = await requireParentTenant(session.user.parentUserId, "/order");
  } else {
    restaurant = await requireRestaurant();
  }
  const params = await searchParams;

  const allDeliveryDates = await prisma.deliveryDate.findMany({
    where: {
      orderingOpen: true,
      cancelledAt: null,
      cutoffAt: { gt: new Date() },
      school: { isActive: true, restaurantId: restaurant.id }
    },
    include: {
      school: true,
      menuAvailability: {
        where: { isAvailable: true, menuItem: { is: { isActive: true } } },
        include: {
          menuItem: {
            include: {
              options: { orderBy: { sortOrder: "asc" } },
              sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
            },
          },
        },
      },
      // Count PAID orders per item to determine sold-out status
      orders: {
        where: { status: "PAID", archivedAt: null },
        select: { items: { select: { menuItemId: true } } }
      }
    },
    orderBy: [{ deliveryDate: "asc" }, { school: { name: "asc" } }]
  });

  // All weekdays accepted — restaurants control which days they schedule deliveries for
  // by which DeliveryDate rows they create in admin.
  const deliveryDates = allDeliveryDates;

  const parent =
    session?.user?.role === "PARENT" && session.user.parentUserId
      ? await prisma.parentUser.findUnique({
          where: { id: session.user.parentUserId },
          include: { children: { where: { archivedAt: null }, orderBy: { studentName: "asc" } } }
        })
      : null;

  const reorderOrder =
    params.reorder && parent
      ? await prisma.order.findFirst({
          where: { id: params.reorder, parentUserId: parent.id },
          include: { items: { include: { menuItem: true } }, deliveryDate: true, school: true, student: true }
        })
      : null;

  const menuItemsByDeliveryDate = Object.fromEntries(
    deliveryDates.map((date) => [date.id, date.menuAvailability.map((e) => e.menuItem)])
  );

  // Per delivery date: set of menuItemIds that have hit their cap
  const soldOutByDeliveryDate = Object.fromEntries(
    deliveryDates.map((date) => {
      // Count how many PAID orders each item has on this date
      const countMap = new Map<string, number>();
      for (const order of date.orders) {
        for (const item of order.items) {
          countMap.set(item.menuItemId, (countMap.get(item.menuItemId) ?? 0) + 1);
        }
      }
      const soldOut = date.menuAvailability
        .filter((entry) => entry.maxQuantity !== null && (countMap.get(entry.menuItemId) ?? 0) >= entry.maxQuantity!)
        .map((entry) => entry.menuItemId);
      return [date.id, soldOut];
    })
  );

  const reorderSchoolId = reorderOrder?.schoolId;

  // Prefer the same school's next delivery date; fall back to any open date
  const initialDeliveryDateId =
    reorderSchoolId && deliveryDates.some((d) => d.schoolId === reorderSchoolId)
      ? deliveryDates.find((d) => d.schoolId === reorderSchoolId)?.id
      : deliveryDates[0]?.id;

  // Build candidate cart items from the original order, then split into
  // available (item exists on the target date's menu) vs. unavailable.
  const availableMenuItemIds = new Set(
    initialDeliveryDateId ? (menuItemsByDeliveryDate[initialDeliveryDateId] ?? []).map((m) => m.id) : []
  );

  // Also check if the target date is even for the same school — if we fell
  // back to a different school's date, nothing from the reorder will match.
  const targetDateSchoolId = deliveryDates.find((d) => d.id === initialDeliveryDateId)?.schoolId;
  const sameSchool = targetDateSchoolId === reorderSchoolId;

  const reorderCandidates =
    reorderOrder?.items.map((item) => {
      const requiredChoices = getRequiredChoicesForMenuItem(item.menuItem);
      const choice = item.additions.find((v) => requiredChoices.includes(v));
      return {
        id: item.id,
        menuItemId: item.menuItemId,
        itemName: item.itemNameSnapshot,
        choice,
        additions: item.additions.filter((v) => !requiredChoices.includes(v)),
        removals: item.removals,
        lineTotalCents: item.lineTotalCents,
        available: sameSchool && availableMenuItemIds.has(item.menuItemId),
      };
    }) ?? [];

  // Collapse identical configurations into a single qty-N cart line.
  // OrderItem rows are one-per-unit in the DB, but the cart UI groups them
  // behind a quantity stepper. Key = menuItemId + choice + sorted add-ons + sorted removals.
  const collapsed = new Map<string, ReturnType<typeof Object> & { quantity: number }>();
  for (const c of reorderCandidates) {
    if (!c.available) continue;
    const a = [...c.additions].sort().join("|");
    const r = [...c.removals].sort().join("|");
    const key = `${c.menuItemId}::${c.choice ?? ""}::${a}::${r}`;
    const existing = collapsed.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      const { available: _, ...rest } = c;
      collapsed.set(key, { ...rest, quantity: 1 });
    }
  }
  const initialCartItems = Array.from(collapsed.values());

  const unavailableReorderItems = reorderCandidates
    .filter((i) => !i.available)
    .map((i) => i.itemName);

  // Distinct: same item might appear twice but only show once in the notice
  const unavailableNames = [...new Set(unavailableReorderItems)];

  return (
    <>
      <SiteHeaderServer />
      <main className="app-content" id="main-content">
        <div className="px-4 py-4">
          {/* Reorder: original school has no open dates — show a clear notice above the form */}
          {reorderOrder && reorderSchoolId && !sameSchool && deliveryDates.length > 0 && (
            <div style={{
              borderRadius: 14, border: "1px solid #e2e8f0",
              background: "#f8fafc", padding: "12px 14px",
              display: "flex", gap: 10, alignItems: "flex-start",
              marginBottom: 12,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                <strong>{reorderOrder.school.name}</strong> has no upcoming delivery dates open for ordering. Showing available dates for other schools instead.
              </p>
            </div>
          )}

          {deliveryDates.length ? (
            <OrderForm
              operatorType={restaurant.operatorType}
              deliveryDates={deliveryDates.map((date) => ({
                id: date.id,
                schoolId: date.schoolId,
                deliveryDate: date.deliveryDate.toISOString(),
                cutoffAt: date.cutoffAt.toISOString(),
                orderingOpen: date.orderingOpen,
                school: {
                  id: date.school.id,
                  name: date.school.name,
                  timezone: date.school.timezone,
                  locationType: date.school.locationType,
                }
              }))}
              menuItemsByDeliveryDate={Object.fromEntries(
                Object.entries(menuItemsByDeliveryDate).map(([key, value]) => [
                  key,
                  value.map((item) => ({
                    id: item.id,
                    slug: item.slug,
                    name: item.name,
                    description: item.description,
                    imageUrl: item.imageUrl ?? null,
                    basePriceCents: item.basePriceCents,
                    // Required-choices and sizes were being stripped here when
                    // mapping the prisma row → wire shape, so the OrderForm
                    // received items without them. The server still validates
                    // against the live DB and would reject submission with a
                    // confusing "Choose a size for X before adding it to the
                    // cart" error — even though the customer never saw the
                    // size picker. Pass them through so the picker renders.
                    requiredChoices: item.requiredChoices,
                    sizes: item.sizes.map((s) => ({
                      id: s.id,
                      name: s.name,
                      priceCents: s.priceCents,
                      sortOrder: s.sortOrder,
                      isDefault: s.isDefault,
                    })),
                    options: item.options.map((o) => ({
                      id: o.id,
                      name: o.name,
                      optionType: o.optionType,
                      priceDeltaCents: o.priceDeltaCents
                    }))
                  }))
                ])
              )}
              savedChildren={
                parent?.children.map((child) => ({
                  id: child.id,
                  schoolId: child.schoolId,
                  studentName: child.studentName,
                  grade: child.grade,
                  allergyNotes: child.allergyNotes ?? ""
                })) ?? []
              }
              initialParentProfile={(() => {
                const preferredChild =
                  (params.childId
                    ? parent?.children.find((c) => c.id === params.childId)
                    : undefined) ??
                  (reorderOrder?.parentChildId
                    ? parent?.children.find((c) => c.id === reorderOrder.parentChildId)
                    : undefined) ??
                  parent?.children[0];
                return {
                  parentName: parent?.name ?? "",
                  parentEmail: parent?.email ?? "",
                  parentChildId: preferredChild?.id ?? "",
                  studentName: reorderOrder?.student.studentName ?? preferredChild?.studentName ?? "",
                  grade: reorderOrder?.student.grade ?? preferredChild?.grade ?? "",
                  allergyNotes:
                    reorderOrder?.items.map((i) => i.allergyNotes).find(Boolean) ??
                    reorderOrder?.student.allergyNotes ??
                    preferredChild?.allergyNotes ?? "",
                };
              })()}
              initialSchoolId={
                reorderSchoolId ??
                (params.childId ? parent?.children.find((c) => c.id === params.childId)?.schoolId : undefined) ??
                parent?.children[0]?.schoolId ?? ""
              }
              initialDeliveryDateId={initialDeliveryDateId ?? ""}
              initialCartItems={initialCartItems}
              unavailableReorderItems={unavailableNames}
              soldOutByDeliveryDate={soldOutByDeliveryDate}
              initialItemSlug={params.item}
            />
          ) : (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-5 text-[13px] text-amber-900">
              Ordering is currently closed. Check back before the next delivery window opens.
            </div>
          )}
        </div>
      </main>
      <AppNav />
    </>
  );
}
