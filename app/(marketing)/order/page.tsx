import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { getWeekdayNumber } from "@/lib/weekly-week";
import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";
import { OrderForm } from "@/components/forms/order-form";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  searchParams
}: {
  searchParams: Promise<{ reorder?: string; item?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  const allDeliveryDates = await prisma.deliveryDate.findMany({
    where: {
      orderingOpen: true,
      cutoffAt: { gt: new Date() },
      school: { isActive: true, slug: { in: [...ALLOWED_SCHOOL_SLUGS] } }
    },
    include: {
      school: true,
      menuAvailability: {
        where: { isAvailable: true, menuItem: { is: { isActive: true } } },
        include: { menuItem: { include: { options: { orderBy: { sortOrder: "asc" } } } } }
      }
    },
    orderBy: [{ deliveryDate: "asc" }, { school: { name: "asc" } }]
  });

  // Filter to Mon–Thu only (school doesn't provide lunch on Fri/Sat/Sun).
  // The deliveryDateSchema already blocks new Friday dates, but existing
  // ones in the DB would otherwise show up here.
  const deliveryDates = allDeliveryDates.filter((d) => {
    const weekday = getWeekdayNumber(d.deliveryDate, d.school.timezone);
    return weekday >= 1 && weekday <= 4;
  });

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

  const reorderSchoolId = reorderOrder?.schoolId;
  const initialDeliveryDateId =
    reorderSchoolId && deliveryDates.some((d) => d.schoolId === reorderSchoolId)
      ? deliveryDates.find((d) => d.schoolId === reorderSchoolId)?.id
      : deliveryDates[0]?.id;

  const initialCartItems =
    reorderOrder?.items.map((item) => {
      const requiredChoices = getRequiredChoicesForMenuItem(item.menuItem.slug);
      const choice = item.additions.find((v) => requiredChoices.includes(v));
      return {
        id: item.id,
        menuItemId: item.menuItemId,
        itemName: item.itemNameSnapshot,
        choice,
        additions: item.additions.filter((v) => !requiredChoices.includes(v)),
        removals: item.removals,
        lineTotalCents: item.lineTotalCents
      };
    }) ?? [];

  return (
    <>
      <SiteHeader />
      <main className="app-content">
        <div className="px-4 py-4">
          {deliveryDates.length ? (
            <OrderForm
              deliveryDates={deliveryDates.map((date) => ({
                id: date.id,
                schoolId: date.schoolId,
                deliveryDate: date.deliveryDate.toISOString(),
                cutoffAt: date.cutoffAt.toISOString(),
                orderingOpen: date.orderingOpen,
                school: { id: date.school.id, name: date.school.name, timezone: date.school.timezone }
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
              initialParentProfile={{
                parentName: parent?.name ?? "",
                parentEmail: parent?.email ?? "",
                parentChildId: reorderOrder?.parentChildId ?? parent?.children[0]?.id ?? "",
                studentName: reorderOrder?.student.studentName ?? "",
                grade: reorderOrder?.student.grade ?? "",
                allergyNotes:
                  reorderOrder?.items.map((i) => i.allergyNotes).find(Boolean) ??
                  reorderOrder?.student.allergyNotes ?? ""
              }}
              initialSchoolId={reorderSchoolId ?? parent?.children[0]?.schoolId ?? ""}
              initialDeliveryDateId={initialDeliveryDateId ?? ""}
              initialCartItems={initialCartItems}
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
