import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { updateOrderAsAdmin } from "@/lib/orders";
import { sendOrderModifiedEmail } from "@/lib/email/service";
import { requireAdminRole } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import { requireRestaurant } from "@/lib/restaurant";
import { listActivity } from "@/lib/activity";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";
import { getLabels } from "@/lib/location-labels";

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

  // Per-order timeline — every audited mutation tied to this order in
  // reverse-chronological order. Pulled in parallel-ready but kept simple
  // since the order query is already done above.
  const timeline = await listActivity({
    restaurantId: restaurant.id,
    entityType: "ORDER",
    entityId: orderId,
    limit: 50,
  });

  const item = order.items[0];
  const now = new Date();
  const cutoffPassed = now >= order.deliveryDate.cutoffAt;
  const cutoffStr = formatInTimeZone(order.deliveryDate.cutoffAt, order.school.timezone, "MMM d 'at' h:mm a zzz");
  const labels = getLabels(order.school.locationType);

  async function saveOrder(formData: FormData) {
    "use server";
    await requireAdminRole("MANAGER");
    // Pull the acting admin's id so the activity timeline can attribute
    // this edit. requireAdminRole has already ensured a session exists.
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string })?.adminUserId;
    await updateOrderAsAdmin({
      orderId,
      restaurantId: restaurant.id,
      adminUserId,
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
    <div className="space-y-4 pb-10 max-w-3xl">

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
              {labels.showGrade && order.student.grade ? `${labels.grade} ${order.student.grade} · ` : ""}{order.school.name}
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
          <p className="text-[11px] text-slate-500 mb-1">{labels.orderer}</p>
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
            {/* Supervisor / group */}
            <div className="grid grid-cols-2 gap-2">
              {labels.showSupervisor && (
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">{labels.supervisor}</label>
                  <input name="teacherName" defaultValue={order.student.teacherName ?? ""}
                    placeholder={labels.supervisorPlaceholder}
                    className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
                </div>
              )}
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">{labels.group}</label>
                <input name="classroom" defaultValue={order.student.classroom ?? ""}
                  placeholder={labels.groupPlaceholder}
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

      {/* ── Activity timeline ─────────────────────────────────────── */}
      <section className="rounded-[14px] border border-slate-100 bg-white">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Activity timeline
          </p>
        </div>
        {timeline.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-slate-400">No events recorded yet.</p>
        ) : (
          <ol className="relative">
            {timeline.map((entry, i) => {
              const actorName = entry.adminUser?.name ?? (entry.parentUserId ? "Customer" : "System");
              const isLast = i === timeline.length - 1;
              return (
                <li key={entry.id} className="relative flex gap-3 px-4 py-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-700 mt-1.5" />
                    {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <p className="text-[12px] text-ink leading-snug">{entry.summary}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {actorName}
                      <span className="text-slate-300 mx-1">·</span>
                      {formatInTimeZone(entry.createdAt, order.school.timezone, "MMM d, h:mm a zzz")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
