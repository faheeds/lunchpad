"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { OrderStatusActions } from "@/components/admin/order-status-actions";
import { OrderRefundAction } from "@/components/admin/order-refund-action";
import { EmptyState } from "@/components/admin/empty-state";
import { formatCurrency, formatList } from "@/lib/utils";

type OrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  archivedAt: string | Date | null;
  createdAt: string | Date;
  totalCents: number;
  discountCents: number;
  refundAmountCents: number;
  specialInstructions: string | null;
  parentName: string;
  parentEmail: string;
  school: { name: string; timezone: string };
  deliveryDate: { deliveryDate: string | Date; originalCutoffAt: string | Date | null };
  student: {
    studentName: string;
    grade: string;
    teacherName: string | null;
    classroom: string | null;
    allergyNotes: string | null;
  };
  items: {
    id: string;
    itemNameSnapshot: string;
    lineTotalCents: number;
    additions: string[];
    removals: string[];
    allergyNotes: string | null;
  }[];
};

type AdminRoleClient = "STAFF" | "MANAGER" | "OWNER";

// Mirror of the API's role gating so the UI hides actions the operator
// doesn't have permission for (saves a confusing 403 round-trip).
const ACTION_REQUIRED_ROLE: Record<string, AdminRoleClient> = {
  archive:             "STAFF",
  unarchive:           "STAFF",
  export_csv:          "STAFF",
  print_labels:        "STAFF",
  cancel:              "MANAGER",
  resend_confirmation: "STAFF",
};

function roleAllows(myRole: AdminRoleClient, required: AdminRoleClient): boolean {
  const order: AdminRoleClient[] = ["STAFF", "MANAGER", "OWNER"];
  return order.indexOf(myRole) >= order.indexOf(required);
}

function fmtDate(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: timezone,
  }).format(new Date(value));
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  PAID:      { bg: "#DEE2CF", text: "#2C4031", label: "Paid" },
  PENDING:   { bg: "#F6EED9", text: "#6E5C2C", label: "Pending" },
  REFUNDED:  { bg: "#F4E3DB", text: "#7C3D24", label: "Refunded" },
  CANCELLED: { bg: "#F4E3DB", text: "#7C3D24", label: "Cancelled" },
};

type BulkAction = {
  key: string;
  label: string;
  /** Style: "neutral" (slate) for safe ops, "danger" (red) for destructive ops. */
  variant: "neutral" | "danger";
  /** When true, prompt the operator before firing. Used for cancel since
   *  it issues a Stripe refund and isn't reversible. */
  confirmTemplate?: (count: number) => string;
};

const BULK_ACTIONS: BulkAction[] = [
  { key: "archive",             label: "Archive",     variant: "neutral" },
  { key: "unarchive",           label: "Unarchive",   variant: "neutral" },
  { key: "export_csv",          label: "Export CSV",  variant: "neutral" },
  { key: "print_labels",        label: "Print labels", variant: "neutral" },
  { key: "resend_confirmation", label: "Resend email", variant: "neutral" },
  {
    key: "cancel",
    label: "Cancel & refund",
    variant: "danger",
    confirmTemplate: (n) =>
      `Cancel ${n} order${n === 1 ? "" : "s"} and refund the customer${n === 1 ? "" : "s"}? This is permanent and triggers a real Stripe refund.`,
  },
];

export function OrdersList({
  orders,
  myRole = "STAFF",
}: {
  orders: OrderListItem[];
  /** Current admin's role — controls which bulk actions are shown. Defaults
   *  to STAFF so a missing prop fails closed. */
  myRole?: AdminRoleClient;
}) {
  const [selectedIds, setSelectedIds]  = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds]  = useState<Set<string>>(new Set());
  const [message, setMessage]          = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, startTransition]   = useTransition();

  // Filter the action set to ones the current role can actually perform.
  const visibleActions = useMemo(
    () => BULK_ACTIONS.filter((a) => roleAllows(myRole, ACTION_REQUIRED_ROLE[a.key] ?? "STAFF")),
    [myRole],
  );

  const allSelected = useMemo(
    () => orders.length > 0 && orders.every((o) => selectedIds.has(o.id)),
    [orders, selectedIds],
  );

  function toggleSelect(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  }

  function toggleExpand(id: string) {
    setExpandedIds((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function runBulkAction(action: BulkAction) {
    if (!selectedIds.size) {
      setMessage({ text: "Select at least one order first.", ok: false });
      return;
    }

    const orderIdList = Array.from(selectedIds);

    // Client-side actions that don't need server confirmation
    if (action.key === "export_csv") {
      const url = `/api/admin/orders/export?orderIds=${orderIdList.join(",")}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = "orders-export.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (action.key === "print_labels") {
      const url = `/admin/orders/labels-print?orderIds=${orderIdList.join(",")}`;
      window.open(url, "_blank");
      return;
    }

    // Destructive actions get a confirm gate. window.confirm is fine here —
    // operator-facing UI, not customer-facing, and a custom modal is overkill.
    if (action.confirmTemplate) {
      const proceed = window.confirm(action.confirmTemplate(selectedIds.size));
      if (!proceed) return;
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.key, orderIds: orderIdList }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.error || "Unable to update orders.", ok: false });
        return;
      }

      // Partial-failure aware: API returns {updated, failed, firstError}.
      // Show a clear "5 ok, 1 failed: <reason>" so the operator knows
      // which orders need a follow-up rather than thinking it all worked.
      const updated: number = data.updated ?? 0;
      const failed: number = data.failed ?? 0;
      const firstError: string | null = data.firstError ?? null;
      let text: string;
      if (failed === 0) {
        text = `Updated ${updated} order${updated === 1 ? "" : "s"}.`;
      } else if (updated === 0) {
        text = `Failed: ${firstError ?? "Unable to update any orders."}`;
      } else {
        text = `Updated ${updated}, ${failed} failed${firstError ? ` — ${firstError}` : ""}.`;
      }
      setMessage({ text, ok: failed === 0 });
      if (updated > 0) {
        setSelectedIds(new Set());
        // Soft refresh: reload the route's RSC payload so the list reflects
        // the new statuses without losing the message we just set. A hard
        // window.location.reload() would wipe the message.
        window.location.reload();
      }
    });
  }

  if (!orders.length) {
    return (
      <EmptyState
        icon="document"
        title="No orders match the current filters."
        description="Try clearing filters or adjusting the date range."
      />
    );
  }

  return (
    <div className="space-y-2">

      {/* Bulk action bar */}
      <div className="rounded-[16px] border border-editorial-line bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <label className="flex items-center gap-2 text-[12px] text-editorial-ink-soft cursor-pointer select-none">
          <input type="checkbox" checked={allSelected} onChange={toggleAll}
            className="rounded border-editorial-line accent-editorial-green" />
          <span>
            {selectedIds.size > 0
              ? `${selectedIds.size} of ${orders.length} selected`
              : `Select all (${orders.length})`}
          </span>
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {visibleActions.map((action) => {
            const isDanger = action.variant === "danger";
            return (
              <button
                key={action.key}
                type="button"
                disabled={isPending || selectedIds.size === 0}
                onClick={() => runBulkAction(action)}
                className={
                  isDanger
                    ? "px-3 py-1.5 rounded-full border border-[#E2C3B3] text-[11px] font-medium text-[#7C3D24] hover:bg-[#F4E3DB] transition disabled:opacity-35 disabled:cursor-default"
                    : "px-3 py-1.5 rounded-full border border-editorial-line text-[11px] font-medium text-editorial-ink hover:border-editorial-green hover:text-editorial-green transition disabled:opacity-35 disabled:cursor-default"
                }
              >
                {action.label}
              </button>
            );
          })}
        </div>
        {message && (
          <p className={`w-full text-[12px] font-medium ${message.ok ? "text-editorial-green" : "text-[#7C3D24]"}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Order cards */}
      {orders.map((order) => {
        const badge    = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.CANCELLED;
        const isOpen   = expandedIds.has(order.id);
        const allergy  = order.items.map((i) => i.allergyNotes).find(Boolean) || order.student.allergyNotes;
        const addons   = order.items.flatMap((i) => i.additions);
        const removals = order.items.flatMap((i) => i.removals);
        const isLate = order.deliveryDate.originalCutoffAt && new Date(order.createdAt) > new Date(order.deliveryDate.originalCutoffAt);

        return (
          <div key={order.id} className={`rounded-[16px] bg-white border overflow-hidden transition-all shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)] ${selectedIds.has(order.id) ? "border-editorial-green border-2" : "border-editorial-line"}`}>
            {/* Primary row */}
            <div className="flex items-center gap-2.5 p-3.5">
              {/* Checkbox */}
              <input type="checkbox" checked={selectedIds.has(order.id)}
                onChange={() => toggleSelect(order.id)}
                className="w-4 h-4 accent-editorial-green flex-shrink-0 cursor-pointer rounded border-editorial-line" />

              {/* Avatar initial */}
              <div className="w-8 h-8 rounded-full flex-shrink-0 bg-[#F4E3DB] flex items-center justify-center text-sm font-bold text-editorial-clay">
                {order.student.studentName[0]?.toUpperCase() ?? "?"}
              </div>

              {/* Student + school */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-editorial-ink">
                    {order.student.studentName}
                  </p>
                  <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                    {badge.label}
                  </span>
                  {order.archivedAt && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-editorial-paper-2 text-editorial-ink-faint">
                      Archived
                    </span>
                  )}
                  {isLate && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-[#F6EED9] text-[#6E5C2C]">
                      Late
                    </span>
                  )}
                  {allergy && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-[#F4E3DB] text-editorial-clay">
                      ⚠ Allergy
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-editorial-ink-soft mt-0.5">
                  {order.school.name} · Gr {order.student.grade}
                  {order.student.teacherName ? ` · ${order.student.teacherName}` : ""}
                  {" · "}{fmtDate(order.deliveryDate.deliveryDate, order.school.timezone)}
                </p>
              </div>

              {/* Items preview — narrow on mobile, expands on desktop */}
              <p
                className="hidden sm:block max-w-[140px] lg:max-w-[260px] xl:max-w-[400px] text-[11px] text-editorial-ink-faint flex-shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
              >
                {order.items.map((i) => i.itemNameSnapshot).join(", ")}
              </p>

              {/* Total */}
              <p className="text-sm font-bold text-editorial-ink flex-shrink-0">
                {formatCurrency(order.totalCents)}
              </p>

              {/* Expand toggle */}
              <button type="button" onClick={() => toggleExpand(order.id)}
                className="flex-shrink-0 p-0 w-6 h-6 rounded border border-editorial-line bg-white cursor-pointer flex items-center justify-center hover:bg-editorial-paper transition">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#938B78" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div className="border-t border-editorial-line p-3.5 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-2 mb-3 pb-3 border-b border-editorial-line">
                  <div className="flex flex-col gap-1 text-sm text-editorial-ink-soft">
                    {addons.length > 0 && (
                      <p><span className="text-editorial-ink-faint font-semibold">Add-ons: </span>{formatList(addons)}</p>
                    )}
                    {removals.length > 0 && (
                      <p><span className="text-editorial-ink-faint font-semibold">Removals: </span>{formatList(removals)}</p>
                    )}
                    {allergy && (
                      <p className="text-editorial-clay">
                        <span className="font-semibold">Allergy: </span>{allergy}
                      </p>
                    )}
                    {order.specialInstructions && (
                      <p><span className="text-editorial-ink-faint font-semibold">Special: </span>{order.specialInstructions}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-editorial-ink-soft">
                    <p><span className="text-editorial-ink-faint font-semibold">Order #: </span>{order.orderNumber}</p>
                    <p><span className="text-editorial-ink-faint font-semibold">Parent: </span>{order.parentName}</p>
                    <p><span className="text-editorial-ink-faint font-semibold">Email: </span>{order.parentEmail}</p>
                    {order.student.classroom && (
                      <p><span className="text-editorial-ink-faint font-semibold">Classroom: </span>{order.student.classroom}</p>
                    )}
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex gap-3 items-center flex-wrap">
                  <Link href={`/admin/orders/${order.id}`}
                    className="text-sm text-editorial-green font-semibold no-underline hover:text-editorial-green-deep">
                    Edit order →
                  </Link>
                  <OrderRefundAction
                    orderId={order.id}
                    orderStatus={order.status}
                    items={order.items.map((item) => ({
                      id: item.id,
                      itemNameSnapshot: item.itemNameSnapshot,
                      lineTotalCents: item.lineTotalCents,
                    }))}
                    totalCents={order.totalCents}
                    discountCents={order.discountCents}
                    refundedAmountCents={order.refundAmountCents}
                    parentName={order.parentName}
                    studentName={order.student.studentName}
                    myRole={myRole}
                  />
                  <OrderStatusActions orderId={order.id} isArchived={Boolean(order.archivedAt)} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
