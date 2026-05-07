import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { updateOrderAsAdmin } from "@/lib/orders";
import { sendOrderModifiedEmail } from "@/lib/email/service";
import { requireAdminRole } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, { bg: string; color: string }> = {
  PAID:      { bg: "#dcfce7", color: "#15803d" },
  PENDING:   { bg: "#fef9c3", color: "#854d0e" },
  REFUNDED:  { bg: "#fee2e2", color: "#991b1b" },
  CANCELLED: { bg: "#f1f5f9", color: "#64748b" },
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const restaurant = await requireRestaurant();

  // Tenant-scoped: only return the order if it belongs to this admin's restaurant.
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId: restaurant.id },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: {
        include: { menuItem: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
      },
    },
  });

  if (!order) notFound();

  const item = order.items[0];
  const now = new Date();
  const cutoffPassed = now >= order.deliveryDate.cutoffAt;
  const cutoffStr = formatInTimeZone(order.deliveryDate.cutoffAt, order.school.timezone, "MMM d 'at' h:mm a zzz");

  async function saveOrder(formData: FormData) {
    "use server";
    await requireAdminRole("MANAGER");
    await updateOrderAsAdmin({
      orderId,
      restaurantId: restaurant.id,
      teacherName: String(formData.get("teacherName") || ""),
      classroom: String(formData.get("classroom") || ""),
      additions: formData.getAll("additions").map(String),
      removals: formData.getAll("removals").map(String),
      allergyNotes: String(formData.get("allergyNotes") || ""),
      specialInstructions: String(formData.get("specialInstructions") || ""),
      adminNote: String(formData.get("adminNote") || "") || undefined,
    });
    // Send notification email to parent (best-effort — never block the save).
    // We use restaurant.id (already in scope) instead of order.restaurantId because
    // TS doesn't carry the post-notFound() narrowing into this server-action closure.
    sendOrderModifiedEmail(orderId, restaurant.id).catch(() => {});
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    redirect("/admin/orders");
  }

  const badge = statusStyle[order.status] ?? { bg: "#f1f5f9", color: "#64748b" };

  return (
    <div className="space-y-4 pb-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="text-[12px] text-slate-500 no-underline flex items-center gap-1 hover:text-ink">
          ← Orders
        </Link>
        <span className="text-slate-200">/</span>
        <span className="text-[12px] text-slate-500">{order.orderNumber}</span>
      </div>

      <h1 className="text-[17px] font-semibold text-ink">Edit order</h1>

      {/* Cutoff override banner */}
      {cutoffPassed && (
        <div style={{
          borderRadius: 12, border: "1px solid #fed7aa",
          background: "#fff7ed", padding: "10px 14px",
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#9a3412" }}>Admin override — cutoff has passed</p>
            <p style={{ fontSize: 11, color: "#c2410c", marginTop: 2 }}>
              Cutoff was {cutoffStr}. You are editing this order as an admin. The parent cannot make changes after cutoff.
            </p>
          </div>
        </div>
      )}

      {/* Order summary card */}
      <div className="rounded-[14px] border border-slate-100 bg-white divide-y divide-slate-50 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-ink">{order.student.studentName}</p>
            <p className="text-[11px] text-slate-500">
              Grade {order.student.grade} &middot; {order.school.name}
            </p>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: badge.bg, color: badge.color,
            borderRadius: 100, padding: "3px 10px",
          }}>
            {order.status}
          </span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500">Delivery</p>
            <p className="text-[13px] font-medium text-ink">
              {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEEE, MMMM d")}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Cutoff: {cutoffStr}
            </p>
          </div>
          <p className="text-[16px] font-semibold text-ink">{formatCurrency(order.totalCents)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-slate-500 mb-1">Parent</p>
          <p className="text-[13px] text-ink">{order.parentName}</p>
          <p className="text-[11px] text-slate-500">{order.parentEmail}</p>
        </div>
      </div>

      {/* Edit form */}
      <form action={saveOrder} className="space-y-3">
        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[13px] font-semibold text-ink">Order details</p>
            {cutoffPassed ? (
              <p className="text-[11px] text-orange-600 mt-0.5 font-medium">Admin override — changes will be applied without cutoff restriction.</p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-0.5">Cutoff: {cutoffStr}</p>
            )}
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Teacher / classroom */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Teacher</label>
                <input name="teacherName" defaultValue={order.student.teacherName ?? ""}
                  className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Classroom</label>
                <input name="classroom" defaultValue={order.student.classroom ?? ""}
                  className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
              </div>
            </div>

            {/* Item customizations */}
            {item && (
              <>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-ink">{item.itemNameSnapshot}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {[
                      item.additions.length ? `Add: ${item.additions.join(", ")}` : "",
                      item.removals.length ? `No: ${item.removals.join(", ")}` : "",
                    ].filter(Boolean).join(" · ") || "No customizations"}
                  </p>
                </div>

                {(item.menuItem.options.filter((o) => o.optionType === "ADD_ON").length > 0 ||
                  item.menuItem.options.filter((o) => o.optionType === "REMOVAL").length > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 mb-2">Add-ons</p>
                      <div className="space-y-1.5">
                        {item.menuItem.options.filter((o) => o.optionType === "ADD_ON").map((o) => (
                          <label key={o.id} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                            <input type="checkbox" name="additions" value={o.name}
                              defaultChecked={item.additions.includes(o.name)} className="rounded" />
                            {o.name}
                            {o.priceDeltaCents > 0 && (
                              <span className="text-slate-400">+{formatCurrency(o.priceDeltaCents)}</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 mb-2">Removals</p>
                      <div className="space-y-1.5">
                        {item.menuItem.options.filter((o) => o.optionType === "REMOVAL").map((o) => (
                          <label key={o.id} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                            <input type="checkbox" name="removals" value={o.name}
                              defaultChecked={item.removals.includes(o.name)} className="rounded" />
                            {o.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Allergy notes */}
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Allergy notes</label>
              <textarea name="allergyNotes" rows={2} defaultValue={item?.allergyNotes ?? ""}
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2 resize-none" />
            </div>

            {/* Special instructions */}
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Special instructions</label>
              <textarea name="specialInstructions" rows={2}
                defaultValue={
                  // Strip any prepended admin note lines so the field shows original instructions only
                  (order.specialInstructions ?? "").replace(/^\[Admin note:[\s\S]*?\]\n?/, "")
                }
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2 resize-none" />
            </div>

            {/* Admin note (always visible, required context when overriding) */}
            <div style={{
              borderRadius: 10, border: "1px solid #e2e8f0",
              background: cutoffPassed ? "#fffbeb" : "#f8fafc",
              padding: "10px 12px",
            }}>
              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                Admin note {cutoffPassed ? "(recommended — reason for override)" : "(optional)"}
              </label>
              <textarea name="adminNote" rows={2} placeholder="e.g. Parent called in — changed to no onions"
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2 resize-none bg-white" />
            </div>
          </div>
        </div>

        <button type="submit" style={{
          width: "100%", padding: "12px 0", borderRadius: 14,
          background: cutoffPassed ? "#ea580c" : "var(--brand-on-white, #c41230)",
          color: "white", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
        }}>
          {cutoffPassed ? "Save (admin override)" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
