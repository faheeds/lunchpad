/**
 * Admin "+ New order" page. Lets a manager (or staff, with limited payment
 * options) place an order on behalf of a customer who didn't go through
 * the self-service flow.
 *
 * Loads all open delivery dates with their menu availability, plus the
 * restaurant's active locations, and hands them to a client-side form
 * that handles the picker + payment-mode UI.
 */

import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import type { AdminRole } from "@/lib/roles";
import { AdminOrderForm } from "@/components/admin/admin-order-form";

export const dynamic = "force-dynamic";

export default async function AdminNewOrderPage() {
  const [restaurant, session] = await Promise.all([requireRestaurant(), auth()]);
  // Any admin can create orders; payment-mode restrictions are enforced
  // on the API side. Staff still see the page so they can generate
  // Stripe Checkout links.
  await requireAdminRole("STAFF");

  const myRole = ((session?.user as { adminRole?: AdminRole } | undefined)?.adminRole ?? "STAFF") as AdminRole;

  const deliveryDates = await prisma.deliveryDate.findMany({
    where: {
      orderingOpen: true,
      cancelledAt: null,
      // Admins can post-cutoff (kitchen flexibility) — don't filter on
      // cutoffAt. We surface a warning in the UI if they pick a past-cutoff
      // date but never block.
      school: { isActive: true, restaurantId: restaurant.id },
    },
    include: {
      school: true,
      menuAvailability: {
        where: { isAvailable: true, menuItem: { is: { isActive: true } } },
        include: { menuItem: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
      },
    },
    orderBy: [{ deliveryDate: "asc" }, { school: { name: "asc" } }],
  });

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className="text-[17px] font-semibold text-ink">New order</h1>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Place an order on behalf of a customer. Use this for phone orders,
          walk-ups, or comped orders.
        </p>
      </div>

      <AdminOrderForm
        myRole={myRole}
        restaurantTimezone={restaurant.timezone}
        deliveryDates={deliveryDates.map((d) => ({
          id: d.id,
          schoolId: d.schoolId,
          deliveryDate: d.deliveryDate.toISOString(),
          cutoffAt: d.cutoffAt.toISOString(),
          school: {
            id: d.school.id,
            name: d.school.name,
            timezone: d.school.timezone,
            locationType: d.school.locationType,
          },
          menuItems: d.menuAvailability.map((entry) => ({
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
      />
    </div>
  );
}
