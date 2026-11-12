import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { updateOrderAsAdmin, swapOrderItemAsAdmin } from "@/lib/orders";
import { sendOrderModifiedEmail, sendOrderEditPaymentLinkEmail } from "@/lib/email/service";
import { modifyOrderLinesAsAdmin, modifyWeeklyBatchAsAdmin, loadWeekEditorData, cancelPendingModification, getPendingModification, applyPendingNow } from "@/lib/order-modify";
import { requireAdminRole, hasRole } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import { requireRestaurant } from "@/lib/restaurant";
import { listActivity, logActivity } from "@/lib/activity";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";
import { stripe } from "@/lib/payments/stripe";
import { CopyUrlButton } from "@/components/admin/copy-url-button";
import { getLabels } from "@/lib/location-labels";
import { issueOrderRefund } from "@/lib/refund";
import { sendRefundEmail } from "@/lib/email/service";
import { RefundModalClient } from "@/components/admin/refund-modal-client";
import { SwapItemClient, type SwapPayload } from "@/components/admin/swap-item-client";
import { ModifyOrderClient, ModifyWeekClient, type ModifyPayload, type WeekPayload } from "@/components/admin/modify-order-client";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, { bg: string; color: string }> = {
  PAID:      { bg: "#DEE2CF", color: "#2C4031" },
  PENDING:   { bg: "#F6EED9", color: "#6E5C2C" },
  REFUNDED:  { bg: "#F4E3DB", color: "#7C3D24" },
  CANCELLED: { bg: "#F4E3DB", color: "#7C3D24" },
};

export const metadata: Metadata = {
  title: "Order",
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
      payment: true,
      items: {
        include: { menuItem: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
      },
    },
  });

  if (!order) notFound();

  // Offline (cash / Zelle) orders are confirmed for the kitchen straight
  // away but the money is collected by the operator — flag them until paid.
  const unpaidOffline =
    order.status === "PAID" &&
    order.payment?.provider === "manual" &&
    order.payment.status === "PENDING";

  // Per-order timeline — every audited mutation tied to this order in
  // reverse-chronological order. Pulled in parallel-ready but kept simple
  // since the order query is already done above.
  const timeline = await listActivity({
    restaurantId: restaurant.id,
    entityType: "ORDER",
    entityId: orderId,
    limit: 50,
  });

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

  async function markOfflinePaid(formData: FormData) {
    "use server";
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string })?.adminUserId ?? null;
    const method = String(formData.get("method") || "cash").trim().slice(0, 40) || "cash";
    const reference = String(formData.get("reference") || "").trim().slice(0, 200) || null;
    const paidOrder = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id },
      include: { payment: true },
    });
    if (!paidOrder?.payment || paidOrder.payment.provider !== "manual" || paidOrder.payment.status !== "PENDING") {
      redirect(`/admin/orders/${orderId}`);
    }
    await prisma.payment.update({
      where: { id: paidOrder.payment.id },
      data: { status: "PAID", paidAt: new Date(), method, notes: reference },
    });
    await logActivity({
      restaurantId: restaurant.id,
      adminUserId,
      entityType: "ORDER",
      entityId: orderId,
      action: "PAID",
      summary: `Marked order ${paidOrder.orderNumber} paid (${method}) — ${formatCurrency(paidOrder.totalCents)}`,
      metadata: { method, reference },
    });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    redirect(`/admin/orders/${orderId}`);
  }

  async function cancelUnpaidOffline() {
    "use server";
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string })?.adminUserId ?? null;
    const target = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id },
      include: { payment: true },
    });
    if (!target?.payment || target.payment.provider !== "manual" || target.payment.status !== "PENDING") {
      redirect(`/admin/orders/${orderId}`);
    }
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await logActivity({
      restaurantId: restaurant.id,
      adminUserId,
      entityType: "ORDER",
      entityId: orderId,
      action: "CANCELLED",
      summary: `Cancelled unpaid order ${target.orderNumber} — ${formatCurrency(target.totalCents)} never collected`,
    });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    redirect(`/admin/orders/${orderId}`);
  }

  async function performRefund(refundOrderId: string, amountCents: number, itemIds: string[]) {
    "use server";
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string })?.adminUserId;

    if (!adminUserId) {
      return { success: false, error: "Admin user not found" };
    }

    try {
      await issueOrderRefund({
        orderId: refundOrderId,
        restaurantId: restaurant.id,
        adminUserId,
        amountCents,
        refundedItemIds: itemIds,
      });

      // Send refund email (best-effort)
      await sendRefundEmail(refundOrderId, restaurant.id, amountCents).catch(() => {});

      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/admin/orders");

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refund failed";
      return { success: false, error: message };
    }
  }

  async function performSwap(payload: SwapPayload) {
    "use server";
    // Re-checked server-side on every call — hiding the UI from STAFF is not
    // the security boundary, this is.
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string })?.adminUserId;

    try {
      const result = await swapOrderItemAsAdmin({
        orderId,
        restaurantId: restaurant.id,
        adminUserId,
        orderItemId: payload.orderItemId,
        newMenuItemId: payload.newMenuItemId,
        size: payload.size,
        choice: payload.choice,
        additions: payload.additions ?? [],
        removals: payload.removals ?? [],
        adminNote: payload.adminNote,
        adjustmentMode:
          payload.adjustment === "stripe_link"
            ? { kind: "stripe_link" }
            : payload.adjustment === "manual"
              ? { kind: "manual", method: payload.manualMethod || "manual" }
              : { kind: "comped" },
      });
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/admin/orders");
      if (result.action === "checkout_required") {
        return { success: true, checkoutUrl: result.checkoutUrl };
      }
      // Best-effort "your order was updated" email to the parent.
      sendOrderModifiedEmail(orderId, restaurant.id).catch(() => {});
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Swap failed." };
    }
  }

  async function performModify(payload: ModifyPayload) {
    "use server";
    // Moves money (refunds / pay links) — re-checked server-side on every call.
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;
    try {
      const result = await modifyOrderLinesAsAdmin({
        orderId,
        restaurantId: restaurant.id,
        adminUserId,
        request: { updates: payload.updates ?? [], removeItemIds: payload.removeItemIds ?? [], adds: payload.adds ?? [] },
        adminNote: payload.adminNote,
        applyNow: payload.applyNow,
        adjustmentMode:
          payload.adjustment === "manual"
            ? { kind: "manual", method: payload.manualMethod || "manual" }
            : payload.adjustment === "comped"
              ? { kind: "comped" }
              : { kind: "stripe_link" },
      });
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/admin/orders");
      if (result.action === "checkout_required") {
        let emailed = false;
        if (payload.emailLink) {
          emailed = await sendOrderEditPaymentLinkEmail(orderId, restaurant.id, result.checkoutUrl, result.deltaCents)
            .then(() => true)
            .catch(() => false);
        }
        return {
          success: true,
          checkoutUrl: result.checkoutUrl,
          emailed,
          message: result.appliedNow
            ? `Order updated now — ${formatCurrency(result.deltaCents)} balance due via payment link.`
            : `Payment link created for ${formatCurrency(result.deltaCents)}.`,
        };
      }
      sendOrderModifiedEmail(orderId, restaurant.id).catch(() => {});
      return {
        success: true,
        message:
          result.refundCents > 0
            ? `Order updated — ${formatCurrency(result.refundCents)} refunded.`
            : "Order updated.",
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Modification failed." };
    }
  }

  async function performModifyWeek(payload: WeekPayload) {
    "use server";
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;
    try {
      const result = await modifyWeeklyBatchAsAdmin({
        restaurantId: restaurant.id,
        adminUserId,
        edits: (payload.edits ?? []).map((e) => ({
          orderId: e.orderId,
          request: { updates: e.updates ?? [], removeItemIds: e.removeItemIds ?? [], adds: e.adds ?? [] },
        })),
        adminNote: payload.adminNote,
        applyNow: payload.applyNow,
        adjustmentMode:
          payload.adjustment === "manual"
            ? { kind: "manual", method: payload.manualMethod || "manual" }
            : payload.adjustment === "comped"
              ? { kind: "comped" }
              : { kind: "stripe_link" },
      });
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/admin/orders");
      if (result.action === "checkout_required") {
        let emailed = false;
        if (payload.emailLink) {
          // One email, sent for the order that owns the link.
          emailed = await sendOrderEditPaymentLinkEmail(payload.edits[0].orderId, restaurant.id, result.checkoutUrl, result.deltaCents)
            .then(() => true)
            .catch(() => false);
        }
        return { success: true, checkoutUrl: result.checkoutUrl, emailed, message: result.appliedNow ? `Week updated now — ${formatCurrency(result.deltaCents)} balance due via one payment link.` : `One payment link created for ${formatCurrency(result.deltaCents)}.` };
      }
      for (const e of payload.edits) sendOrderModifiedEmail(e.orderId, restaurant.id).catch(() => {});
      return {
        success: true,
        message: result.refundCents > 0 ? `Week updated — ${formatCurrency(result.refundCents)} refunded in one refund.` : "Week updated.",
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Modification failed." };
    }
  }

  async function applyNowAction() {
    "use server";
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;
    await applyPendingNow({ orderId, restaurantId: restaurant.id, adminUserId }).catch(() => {});
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
  }

  async function cancelPayLink() {
    "use server";
    await requireAdminRole("MANAGER");
    const session = await auth();
    const adminUserId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;
    await cancelPendingModification({ orderId, restaurantId: restaurant.id, adminUserId }).catch(() => {});
    revalidatePath(`/admin/orders/${orderId}`);
  }

  // Swap is MANAGER+ only (it can move money) — STAFF never sees the panel.
  const swapSession = await auth();
  const canSwap =
    hasRole((swapSession?.user as { adminRole?: string } | undefined)?.adminRole, "MANAGER") &&
    order.status === "PAID" &&
    !order.archivedAt &&
    order.refundAmountCents === 0 &&
    !order.pendingEditCheckoutSession &&
    order.items.length > 0;

  const canModify =
    hasRole((swapSession?.user as { adminRole?: string } | undefined)?.adminRole, "MANAGER") &&
    order.status === "PAID" &&
    !order.archivedAt &&
    order.refundAmountCents === 0 &&
    !cutoffPassed &&
    order.items.length > 0;
  const pendingMod =
    order.pendingEditCheckoutSession || order.pendingEditTotalCents != null
      ? await getPendingModification(orderId, restaurant.id)
      : null;
  const modifyBlockedByLink = !!pendingMod;
  // Unpaid order created with "payment link": show the live Stripe link so the
  // admin can copy it or text it (the email may not have reached the parent).
  let openPayLink: string | null = null;
  if (
    order.status === "PENDING" &&
    order.payment?.provider === "stripe_checkout_link" &&
    order.checkoutSessionId &&
    stripe
  ) {
    try {
      const sess = await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
      if (sess.status === "open" && sess.payment_status !== "paid") openPayLink = sess.url ?? null;
    } catch {
      openPayLink = null;
    }
  }
  const isStripeOrder = order.payment?.provider === "stripe" || order.payment?.provider === "stripe_checkout_link";

  const weekOrders =
    canModify && !modifyBlockedByLink && order.payment?.provider === "stripe-weekly-batch"
      ? await loadWeekEditorData(order, restaurant.id)
      : [];

  const swapMenuItems = canSwap || (canModify && !modifyBlockedByLink)
    ? (
        await prisma.deliveryMenuItem.findMany({
          where: {
            deliveryDateId: order.deliveryDateId,
            isAvailable: true,
            menuItem: { restaurantId: restaurant.id, isActive: true },
          },
          include: {
            menuItem: {
              include: {
                options: { orderBy: { sortOrder: "asc" } },
                sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
              },
            },
          },
        })
      )
        .map((e) => e.menuItem)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          basePriceCents: m.basePriceCents,
          sizes: m.sizes.map((s) => ({ name: s.name, priceCents: s.priceCents })),
          requiredChoices: m.requiredChoices ?? [],
          addOns: m.options
            .filter((o) => o.optionType === "ADD_ON")
            .map((o) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents })),
          removals: m.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name),
        }))
    : [];

  const badge = statusStyle[order.status] ?? { bg: "#F4E3DB", color: "#7C3D24" };

  return (
    <div className="space-y-4 pb-10 max-w-3xl bg-editorial-paper min-h-screen">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="text-[12px] text-editorial-ink-soft no-underline flex items-center gap-1 hover:text-editorial-ink">
          ← Orders
        </Link>
        <span className="text-editorial-line">/</span>
        <span className="text-[12px] text-editorial-ink-soft">{order.orderNumber}</span>
      </div>

      <h1 className="text-[17px] font-semibold text-editorial-ink font-editorial">Edit order</h1>

      {/* Cutoff override banner */}
      {cutoffPassed && (
        <div className="rounded-[12px] border border-[#E5D6A8] bg-[#F6EED9] px-3.5 py-2.5 flex gap-2.5 items-start">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0673E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p className="text-sm font-bold text-editorial-clay">Admin override — cutoff has passed</p>
            <p className="text-[11px] text-editorial-clay mt-1">
              Cutoff was {cutoffStr}. You are editing this order as an admin. The parent cannot make changes after cutoff.
            </p>
          </div>
        </div>
      )}

      {/* Order summary card */}
      <div className="rounded-[16px] border border-editorial-line bg-white divide-y divide-editorial-paper-2 overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-editorial-ink">{order.student.studentName}</p>
            <p className="text-[11px] text-editorial-ink-soft">
              {labels.showGrade && order.student.grade ? `${labels.grade} ${order.student.grade} · ` : ""}{order.school.name}
            </p>
          </div>
          <span className="px-2.5 py-1 text-[10px] font-semibold rounded-full" style={{ background: badge.bg, color: badge.color }}>
            {order.status}
          </span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-editorial-ink-soft">Delivery</p>
            <p className="text-sm font-medium text-editorial-ink">
              {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEEE, MMMM d")}
            </p>
            <p className="text-[10px] text-editorial-ink-faint mt-0.5">
              Cutoff: {cutoffStr}
            </p>
          </div>
          <p className="text-lg font-semibold text-editorial-ink">{formatCurrency(order.totalCents)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-editorial-ink-soft mb-1">{labels.orderer}</p>
          <p className="text-sm text-editorial-ink">{order.parentName}</p>
          <p className="text-[11px] text-editorial-ink-soft">{order.parentEmail}</p>
          {order.customerPhone && (
            <p className="text-[11px] text-editorial-ink-soft">
              <a href={`tel:${order.customerPhone}`} className="underline">{order.customerPhone}</a>
            </p>
          )}
        </div>
        {order.fulfillmentType && (
          <div className="px-4 py-3 border-t border-editorial-line">
            <p className="text-[11px] text-editorial-ink-soft mb-1">
              {order.fulfillmentType === "DELIVERY" ? "Deliver to" : "Pickup"}
            </p>
            <p className="text-sm text-editorial-ink">
              {order.fulfillmentType === "DELIVERY" ? order.deliveryAddress : order.school.name}
            </p>
            {order.deliveryNotes && (
              <p className="text-[11px] text-editorial-ink-soft mt-0.5">Notes: {order.deliveryNotes}</p>
            )}
          </div>
        )}
      </div>

      {/* Offline payment (cash / Zelle) */}
      {order.payment?.provider === "manual" && order.payment.method && order.status !== "CANCELLED" && (
        <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <div className="px-4 py-3 border-b border-editorial-line flex items-center justify-between">
            <p className="text-sm font-semibold text-editorial-ink">Payment</p>
            <span
              className="px-2.5 py-1 text-[10px] font-semibold rounded-full"
              style={unpaidOffline ? { background: "#F6EED9", color: "#6E5C2C" } : { background: "#DEE2CF", color: "#2C4031" }}
            >
              {unpaidOffline ? "AWAITING PAYMENT" : "PAID"}
            </span>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-[12px] text-editorial-ink-soft">
              {unpaidOffline
                ? `Customer chose to pay by ${order.payment.method}. Collect ${formatCurrency(order.totalCents)}, then mark it paid.`
                : `Paid by ${order.payment.method}${order.payment.notes ? ` — ${order.payment.notes}` : ""}.`}
            </p>
            {unpaidOffline && (
              <>
                <form action={markOfflinePaid} className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-[11px] text-editorial-ink-soft block mb-1">Received via</label>
                    <select name="method" defaultValue={order.payment.method}
                      className="rounded-lg border border-editorial-line text-[13px] px-3 py-2">
                      <option value="cash">Cash</option>
                      <option value="zelle">Zelle</option>
                      <option value="venmo">Venmo</option>
                      <option value="check">Check</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[11px] text-editorial-ink-soft block mb-1">Reference (optional)</label>
                    <input name="reference" type="text" placeholder="Zelle confirmation, check #…"
                      className="w-full rounded-lg border border-editorial-line text-[13px] px-3 py-2" />
                  </div>
                  <button type="submit"
                    className="px-4 py-2 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition">
                    Mark as paid
                  </button>
                </form>
                <form action={cancelUnpaidOffline}>
                  <button type="submit" className="text-[12px] font-medium underline" style={{ color: "#7C3D24" }}>
                    Cancel this unpaid order
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}


      {/* Refund section */}
      {(order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") && !unpaidOffline && (
        <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <div className="px-4 py-3 border-b border-editorial-line">
            <p className="text-sm font-semibold text-editorial-ink">Refund</p>
          </div>
          <div className="px-4 py-3 space-y-3">
            {order.refundAmountCents > 0 && (
              <div className="rounded-lg bg-editorial-paper-2 px-3 py-2.5">
                <p className="text-[11px] text-editorial-ink-soft mb-1">Already refunded</p>
                <p className="text-lg font-bold text-editorial-ink">{formatCurrency(order.refundAmountCents)}</p>
                {order.status === "PARTIALLY_REFUNDED" && (
                  <p className="text-[11px] text-editorial-ink-soft mt-1">
                    Remaining refundable: {formatCurrency(order.totalCents - order.refundAmountCents)}
                  </p>
                )}
              </div>
            )}
            {order.refundAmountCents < order.totalCents && (
              <RefundModalClient
                orderId={orderId}
                orderStatus={order.status}
                orderNumber={order.orderNumber}
                items={order.items.map((item) => ({
                  id: item.id,
                  itemNameSnapshot: item.itemNameSnapshot,
                  lineTotalCents: item.lineTotalCents,
                  refundedAt: item.refundedAt,
                }))}
                totalCents={order.totalCents}
                discountCents={order.discountCents}
                refundedAmountCents={order.refundAmountCents}
                parentName={order.parentName}
                studentName={order.student.studentName}
                refundAction={performRefund}
              />
            )}
          </div>
        </div>
      )}
      {/* Line items display */}
      <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-4 py-3 border-b border-editorial-line">
          <p className="text-sm font-semibold text-editorial-ink">Line items ({order.items.length})</p>
        </div>
        <div className="px-4 py-3 space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="rounded-lg bg-editorial-paper-2 px-3 py-2.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-editorial-ink">
                    {item.itemNameSnapshot}
                    {item.sizeName && <span className="text-editorial-ink-soft font-normal"> · {item.sizeName}</span>}
                  </p>
                  <p className="text-[11px] text-editorial-ink-soft mt-0.5">
                    {[
                      item.additions.length ? `Add: ${item.additions.join(", ")}` : "",
                      item.removals.length ? `No: ${item.removals.join(", ")}` : "",
                    ].filter(Boolean).join(" · ") || "No customizations"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-editorial-ink flex-shrink-0">{formatCurrency(item.lineTotalCents)}</p>
              </div>
            </div>
          ))}
          {openPayLink && (
            <div className="rounded-lg bg-editorial-paper-2 px-3 py-3 space-y-2">
              <p className="text-[13px] font-medium text-editorial-ink">
                Waiting on payment of {formatCurrency(order.totalCents)} — payment link
              </p>
              <input readOnly value={openPayLink} className="w-full rounded-lg border border-editorial-line text-[12px] px-3 py-2 bg-white" />
              <div className="flex flex-wrap gap-2">
                <CopyUrlButton url={openPayLink} />
                <a
                  href={`sms:${order.customerPhone ?? ""}?&body=${encodeURIComponent(`Hi ${order.parentName}, here is your payment link for order ${order.orderNumber}: ${openPayLink}`)}`}
                  className="px-3 py-2 rounded-full text-[12px] font-medium border bg-white border-editorial-line text-editorial-ink-soft hover:text-editorial-ink"
                >
                  Text this link
                </a>
              </div>
            </div>
          )}
          {pendingMod && (
            <div className="rounded-lg bg-editorial-paper-2 px-3 py-3 space-y-2">
              <p className="text-sm font-semibold text-editorial-ink">
                {pendingMod.applied
                  ? `Changes applied — ${formatCurrency(pendingMod.deltaCents)} balance due`
                  : `Waiting on payment of ${formatCurrency(pendingMod.deltaCents)}`}
              </p>
              <p className="text-[11px] text-editorial-ink-soft">
                {pendingMod.applied
                  ? "The kitchen already sees the updated order. The customer can still pay the link; or close the balance if you collected it another way or want to waive it."
                  : "The order stays as-is until the link is paid, then every change applies automatically. You can also apply the changes now and collect later."}
              </p>
              {pendingMod.url && <input readOnly value={pendingMod.url} className="w-full rounded-lg border border-editorial-line text-[12px] px-3 py-2 bg-white" />}
              <div className="flex flex-wrap gap-4">
                {!pendingMod.applied && (
                  <form action={applyNowAction}>
                    <button type="submit" className="text-[12px] font-semibold underline text-editorial-green cursor-pointer">Apply changes now (collect later)</button>
                  </form>
                )}
                <form action={cancelPayLink}>
                  <button type="submit" className="text-[12px] underline text-red-700 cursor-pointer">
                    {pendingMod.applied ? "Close balance (collected / waived)" : "Cancel link — discard changes"}
                  </button>
                </form>
              </div>
            </div>
          )}
          {canModify && !modifyBlockedByLink && (
            <ModifyOrderClient
              currentTotalCents={order.totalCents}
              currentSubtotalCents={order.subtotalCents}
              discountCents={order.discountCents}
              isStripe={isStripeOrder}
              lines={order.items.map((i) => ({
                id: i.id,
                menuItemId: i.menuItemId,
                name: i.itemNameSnapshot,
                sizeName: i.sizeName,
                basePriceCents: i.basePriceCents,
                additions: i.additions,
                removals: i.removals,
                refunded: !!i.refundedAt,
                menu: {
                  id: i.menuItem.id,
                  name: i.menuItem.name,
                  basePriceCents: i.menuItem.basePriceCents,
                  sizes: [],
                  requiredChoices: i.menuItem.requiredChoices ?? [],
                  addOns: i.menuItem.options
                    .filter((o) => o.optionType === "ADD_ON")
                    .map((o) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents })),
                  removals: i.menuItem.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name),
                },
              }))}
              menuItems={swapMenuItems}
              action={performModify}
            />
          )}
          {weekOrders.length >= 2 && (
            <ModifyWeekClient orders={weekOrders} isStripe action={performModifyWeek} />
          )}
          {canSwap && (
            <SwapItemClient
              orderItemId={order.items[0].id}
              currentItemLabel={`${order.items[0].itemNameSnapshot}${order.items[0].sizeName ? ` · ${order.items[0].sizeName}` : ""}`}
              currentLineTotalCents={order.items[0].lineTotalCents}
              currentTotalCents={order.totalCents}
              menuItems={swapMenuItems}
              swapAction={performSwap}
            />
          )}
        </div>
      </div>

      {/* Edit form */}
      <form action={saveOrder} className="space-y-3">
        <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <div className="px-4 py-3 border-b border-editorial-line">
            <p className="text-sm font-semibold text-editorial-ink">Order details</p>
            {cutoffPassed ? (
              <p className="text-[11px] text-editorial-clay mt-0.5 font-medium">Admin override — changes will be applied without cutoff restriction.</p>
            ) : (
              <p className="text-[11px] text-editorial-ink-soft mt-0.5">Cutoff: {cutoffStr}</p>
            )}
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Supervisor / group */}
            <div className="grid grid-cols-2 gap-2">
              {labels.showSupervisor && (
                <div>
                  <label className="text-[11px] text-editorial-ink-soft mb-1 block">{labels.supervisor}</label>
                  <input name="teacherName" defaultValue={order.student.teacherName ?? ""}
                    placeholder={labels.supervisorPlaceholder}
                    className="w-full rounded-lg border border-editorial-line text-sm px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                </div>
              )}
              <div>
                <label className="text-[11px] text-editorial-ink-soft mb-1 block">{labels.group}</label>
                <input name="classroom" defaultValue={order.student.classroom ?? ""}
                  placeholder={labels.groupPlaceholder}
                  className="w-full rounded-lg border border-editorial-line text-sm px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
              </div>
            </div>

            {/* Item customizations for first item */}
            {order.items.length > 0 && (
              <>
                {order.items.length > 1 && (
                  <div className="rounded-lg bg-editorial-paper px-3 py-2 border border-editorial-line-soft">
                    <p className="text-[11px] text-editorial-ink-soft">
                      <strong>Note:</strong> Edit customizations below for the first item only. To edit other items, contact the customer.
                    </p>
                  </div>
                )}
                {(() => {
                  const item = order.items[0];
                  return (
                    <>
                      <div className="rounded-lg bg-editorial-paper-2 px-3 py-2.5">
                        <p className="text-sm font-semibold text-editorial-ink">{item.itemNameSnapshot}</p>
                        <p className="text-[11px] text-editorial-ink-soft mt-0.5">
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
                            <p className="text-[11px] font-semibold text-editorial-ink-soft mb-2">Add-ons</p>
                            <div className="space-y-1.5">
                              {item.menuItem.options.filter((o) => o.optionType === "ADD_ON").map((o) => (
                                <label key={o.id} className="flex items-center gap-2 text-sm text-editorial-ink-soft cursor-pointer">
                                  <input type="checkbox" name="additions" value={o.name}
                                    defaultChecked={item.additions.includes(o.name)} className="rounded border-editorial-line accent-editorial-green" />
                                  {o.name}
                                  {o.priceDeltaCents > 0 && (
                                    <span className="text-editorial-ink-faint">+{formatCurrency(o.priceDeltaCents)}</span>
                                  )}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-editorial-ink-soft mb-2">Removals</p>
                            <div className="space-y-1.5">
                              {item.menuItem.options.filter((o) => o.optionType === "REMOVAL").map((o) => (
                                <label key={o.id} className="flex items-center gap-2 text-sm text-editorial-ink-soft cursor-pointer">
                                  <input type="checkbox" name="removals" value={o.name}
                                    defaultChecked={item.removals.includes(o.name)} className="rounded border-editorial-line accent-editorial-green" />
                                  {o.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}

            {/* Allergy notes */}
            <div>
              <label className="text-[11px] text-editorial-ink-soft mb-1 block">Allergy notes</label>
              <textarea name="allergyNotes" rows={2} defaultValue={order.items[0]?.allergyNotes ?? ""}
                className="w-full rounded-lg border border-editorial-line text-sm px-3 py-2 resize-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
            </div>

            {/* Special instructions */}
            <div>
              <label className="text-[11px] text-editorial-ink-soft mb-1 block">Special instructions</label>
              <textarea name="specialInstructions" rows={2}
                defaultValue={
                  // Strip any prepended admin note lines so the field shows original instructions only
                  (order.specialInstructions ?? "").replace(/^\[Admin note:[\s\S]*?\]\n?/, "")
                }
                className="w-full rounded-lg border border-editorial-line text-sm px-3 py-2 resize-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
            </div>

            {/* Admin note (always visible, required context when overriding) */}
            <div className={`rounded-[10px] border px-3 py-2.5 ${cutoffPassed ? "border-[#E5D6A8] bg-[#F6EED9]" : "border-editorial-line bg-editorial-paper-2"}`}>
              <label className="text-[11px] font-semibold text-editorial-ink-soft mb-1 block">
                Admin note {cutoffPassed ? "(recommended — reason for override)" : "(optional)"}
              </label>
              <textarea name="adminNote" rows={2} placeholder="e.g. Parent called in — changed to no onions"
                className="w-full rounded-lg border border-editorial-line text-sm px-3 py-2 resize-none bg-white focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
            </div>
          </div>
        </div>

        <button type="submit" className={`w-full py-3 rounded-full text-white text-base font-bold border-none cursor-pointer ${cutoffPassed ? "bg-editorial-clay hover:bg-[#A85435]" : "bg-editorial-green hover:bg-editorial-green-deep"} transition`}>
          {cutoffPassed ? "Save (admin override)" : "Save changes"}
        </button>
      </form>

      {/* ── Activity timeline ─────────────────────────────────────── */}
      <section className="rounded-[16px] border border-editorial-line bg-white shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-4 py-2.5 border-b border-editorial-line">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-editorial-ink-faint">
            Activity timeline
          </p>
        </div>
        {timeline.length === 0 ? (
          <p className="px-4 py-4 text-sm text-editorial-ink-faint">No events recorded yet.</p>
        ) : (
          <ol className="relative">
            {timeline.map((entry, i) => {
              const actorName = entry.adminUser?.name ?? (entry.parentUserId ? "Customer" : "System");
              const isLast = i === timeline.length - 1;
              return (
                <li key={entry.id} className="relative flex gap-3 px-4 py-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-editorial-green mt-1.5" />
                    {!isLast && <div className="w-px flex-1 bg-editorial-line mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <p className="text-sm text-editorial-ink leading-snug">{entry.summary}</p>
                    <p className="text-[10px] text-editorial-ink-faint mt-0.5">
                      {actorName}
                      <span className="text-editorial-line mx-1">·</span>
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
