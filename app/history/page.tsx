import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireParent } from "@/lib/parent-auth";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { CancelOrderButton } from "@/components/cancel-order-button";
import { EditOrderSheet } from "@/components/edit-order-sheet";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, { label: string; bg: string; color: string }> = {
  PAID:      { label: "Confirmed",  bg: "#dcfce7", color: "#166534" },
  PENDING:   { label: "Pending",    bg: "#fef9c3", color: "#854d0e" },
  REFUNDED:  { label: "Refunded",   bg: "#fee2e2", color: "#991b1b" },
  CANCELLED: { label: "Cancelled",  bg: "#f1f5f9", color: "#64748b" },
};

export default async function HistoryPage() {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) redirect("/account/sign-in");

  // requireParent already enforces that the session's tenant matches the
  // current host. Filter orders by that tenant explicitly as defense in
  // depth — pre-migration data could in theory have orders linked to a
  // parent at a different restaurant.
  const parentRestaurantId = session.user?.parentRestaurantId;
  const orders = await prisma.order.findMany({
    where: {
      parentUserId,
      ...(parentRestaurantId ? { restaurantId: parentRestaurantId } : {}),
      archivedAt: null,
    },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: {
        include: {
          menuItem: {
            include: { options: { orderBy: { sortOrder: "asc" } } }
          }
        }
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const now = new Date();

  return (
    <>
      <SiteHeaderServer />
      <main className="app-content pb-4">
        <div className="px-4 py-4">
          <p style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "var(--brand-on-white)",
            marginBottom: 2,
          }}>
            Orders
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--dark-bg)", marginBottom: 16 }}>
            Order history
          </h1>

          {orders.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {orders.map((order) => {
                const badge = statusLabel[order.status] ?? statusLabel.CANCELLED;
                const isPaid = order.status === "PAID";
                const beforeCutoff = now < order.deliveryDate.cutoffAt;
                const canModify = isPaid && beforeCutoff;

                const cutoffStr = formatInTimeZone(
                  order.deliveryDate.cutoffAt,
                  order.school.timezone,
                  "MMM d 'at' h:mm a"
                );

                const item = order.items[0];
                const menuOptions = item?.menuItem.options.map((o) => ({
                  name: o.name,
                  optionType: o.optionType as "ADD_ON" | "REMOVAL",
                  priceDeltaCents: o.priceDeltaCents,
                })) ?? [];

                return (
                  <div
                    key={order.id}
                    style={{
                      background: "white",
                      borderRadius: 16,
                      padding: "14px 16px",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                      border: "1px solid rgba(0,0,0,0.05)",
                    }}
                  >
                    {/* Top row: name + status badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark-bg)", marginBottom: 2 }}>
                          {order.student.studentName}
                        </p>
                        <p style={{ fontSize: 11, color: "#78716c", lineHeight: 1.4 }}>
                          {order.items.map((i) => i.itemNameSnapshot).join(", ")}
                        </p>
                        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {order.school.name} &middot; {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEE, MMM d")}
                        </p>
                        <p style={{ fontSize: 10, color: "#cbd5e1", marginTop: 1 }}>
                          {order.orderNumber}
                        </p>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          padding: "3px 9px", borderRadius: 20,
                          background: badge.bg, color: badge.color,
                          display: "inline-block",
                        }}>
                          {badge.label}
                        </span>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--dark-bg)", marginTop: 4 }}>
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(order.totalCents / 100)}
                        </p>
                      </div>
                    </div>

                    {/* Action row */}
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginTop: 10, paddingTop: 10,
                      borderTop: "1px solid rgba(0,0,0,0.05)",
                    }}>
                      <div>
                        {canModify && (
                          <p style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>
                            Editable until {cutoffStr}
                          </p>
                        )}
                        {canModify && (
                          <div style={{ display: "flex", gap: 12 }}>
                            <EditOrderSheet
                              orderId={order.id}
                              orderNumber={order.orderNumber}
                              currentAdditions={item?.additions ?? []}
                              currentRemovals={item?.removals ?? []}
                              currentAllergyNotes={item?.allergyNotes ?? null}
                              currentSpecialInstructions={item?.specialInstructions ?? null}
                              menuOptions={menuOptions}
                              basePriceCents={item?.basePriceCents ?? order.totalCents}
                            />
                            <CancelOrderButton
                              orderId={order.id}
                              orderNumber={order.orderNumber}
                              amountCents={order.totalCents}
                            />
                          </div>
                        )}
                      </div>
                      {isPaid && (
                        <Link
                          href={`/order?reorder=${order.id}`}
                          style={{
                            fontSize: 11, color: "var(--brand-on-white)",
                            fontWeight: 600, textDecoration: "none",
                          }}
                        >
                          Reorder &rarr;
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              borderRadius: 18, border: "1px solid #f1f5f9",
              background: "white", padding: "32px 16px", textAlign: "center",
            }}>
              <p style={{ fontSize: 14, color: "#94a3b8" }}>No orders yet.</p>
              <Link href="/order" style={{
                marginTop: 12, display: "inline-block",
                fontSize: 13, fontWeight: 600,
                color: "var(--brand-on-white)", textDecoration: "none",
              }}>
                Place your first order &rarr;
              </Link>
            </div>
          )}
        </div>
      </main>
      <AppNav />
    </>
  );
}
