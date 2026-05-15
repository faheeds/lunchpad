"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { OrderStatusActions } from "@/components/admin/order-status-actions";
import { formatCurrency, formatList } from "@/lib/utils";

type OrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  archivedAt: string | Date | null;
  createdAt: string | Date;
  totalCents: number;
  specialInstructions: string | null;
  parentName: string;
  parentEmail: string;
  school: { name: string; timezone: string };
  deliveryDate: { deliveryDate: string | Date };
  student: {
    studentName: string;
    grade: string;
    teacherName: string | null;
    classroom: string | null;
    allergyNotes: string | null;
  };
  items: {
    itemNameSnapshot: string;
    additions: string[];
    removals: string[];
    allergyNotes: string | null;
  }[];
};

type AdminRoleClient = "STAFF" | "MANAGER" | "OWNER";

// Mirror of the API's role gating so the UI hides actions the operator
// doesn't have permission for (saves a confusing 403 round-trip).
const ACTION_REQUIRED_ROLE: Record<string, AdminRoleClient> = {
  archive:       "STAFF",
  export_csv:    "STAFF",
  print_labels:  "STAFF",
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
  PAID:      { bg: "#dcfce7", text: "#15803d", label: "Paid" },
  PENDING:   { bg: "#fef9c3", text: "#854d0e", label: "Pending" },
  REFUNDED:  { bg: "#fee2e2", text: "#b91c1c", label: "Refunded" },
  CANCELLED: { bg: "#f3f4f6", text: "#6b7280", label: "Cancelled" },
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
  { key: "export_csv",          label: "Export CSV",  variant: "neutral" },
  { key: "print_labels",        label: "Print labels", variant: "neutral" },
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

    // Handle special non-DB actions
    if (action.key === "export_csv") {
      const orderIds = Array.from(selectedIds);
      const url = new URL("/api/admin/export/bulk", window.location.origin);
      orderIds.forEach(id => url.searchParams.append("orderIds", id));
      // Trigger download by navigating to the CSV endpoint
      window.location.href = url.toString();
      setSelectedIds(new Set());
      return;
    }

    if (action.key === "print_labels") {
      const orderIds = Array.from(selectedIds);
      const url = new URL("/admin/orders/labels-print", window.location.origin);
      orderIds.forEach(id => url.searchParams.append("orderIds", id));
      // Open print page in new tab
      window.open(url.toString(), "_blank");
      setSelectedIds(new Set());
      setMessage({ text: "Opened print labels in a new tab.", ok: true });
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
        body: JSON.stringify({ action: action.key, orderIds: Array.from(selectedIds) }),
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
      <div className="rounded-[14px] border border-slate-100 bg-white px-4 py-10 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <p className="text-[13px] font-medium text-slate-400">No orders match the current filters.</p>
        <p className="text-[11px] text-slate-300 mt-1">Try clearing filters or adjusting the date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">

      {/* Bulk action bar */}
      <div className="rounded-[14px] border border-slate-100 bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={allSelected} onChange={toggleAll}
            className="rounded border-slate-300 accent-brand-700" />
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
                    ? "px-3 py-1.5 rounded-full border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-35 disabled:cursor-default"
                    : "px-3 py-1.5 rounded-full border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-35 disabled:cursor-default"
                }
              >
                {action.label}
              </button>
            );
          })}
        </div>
        {message && (
          <p className={`w-full text-[12px] font-medium ${message.ok ? "text-green-700" : "text-red-600"}`}>
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

        return (
          <div key={order.id} style={{
            background: "white",
            borderRadius: 14,
            border: selectedIds.has(order.id) ? "1.5px solid #c41230" : "1px solid #f1f5f9",
            overflow: "hidden",
            transition: "border-color 0.15s",
          }}>
            {/* Primary row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
              {/* Checkbox */}
              <input type="checkbox" checked={selectedIds.has(order.id)}
                onChange={() => toggleSelect(order.id)}
                style={{ width: 15, height: 15, accentColor: "#c41230", flexShrink: 0, cursor: "pointer" }} />

              {/* Avatar initial */}
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: "#fff1f3", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#c41230",
              }}>
                {order.student.studentName[0]?.toUpperCase() ?? "?"}
              </div>

              {/* Student + school */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#0f1923" }}>
                    {order.student.studentName}
                  </p>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: badge.bg, color: badge.text,
                    borderRadius: 100, padding: "2px 8px",
                  }}>
                    {badge.label}
                  </span>
                  {order.archivedAt && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: "#f1f5f9", color: "#94a3b8", borderRadius: 100, padding: "2px 8px" }}>
                      Archived
                    </span>
                  )}
                  {allergy && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: "#fef9c3", color: "#92400e", borderRadius: 100, padding: "2px 8px" }}>
                      ⚠ Allergy
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                  {order.school.name} · Gr {order.student.grade}
                  {order.student.teacherName ? ` · ${order.student.teacherName}` : ""}
                  {" · "}{fmtDate(order.deliveryDate.deliveryDate, order.school.timezone)}
                </p>
              </div>

              {/* Items preview — narrow on mobile, expands on desktop */}
              <p
                className="hidden sm:block max-w-[140px] lg:max-w-[260px] xl:max-w-[400px]"
                style={{ fontSize: 11, color: "#64748b", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {order.items.map((i) => i.itemNameSnapshot).join(", ")}
              </p>

              {/* Total */}
              <p style={{ fontSize: 14, fontWeight: 700, color: "#0f1923", flexShrink: 0 }}>
                {formatCurrency(order.totalCents)}
              </p>

              {/* Expand toggle */}
              <button type="button" onClick={() => toggleExpand(order.id)}
                style={{
                  width: 24, height: 24, borderRadius: 6, border: "1px solid #e2e8f0",
                  background: "white", cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
                }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ borderTop: "1px solid #f8fafc", padding: "10px 14px 12px" }}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-2">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569" }}>
                    {addons.length > 0 && (
                      <p><span style={{ color: "#94a3b8", fontWeight: 600 }}>Add-ons: </span>{formatList(addons)}</p>
                    )}
                    {removals.length > 0 && (
                      <p><span style={{ color: "#94a3b8", fontWeight: 600 }}>Removals: </span>{formatList(removals)}</p>
                    )}
                    {allergy && (
                      <p style={{ color: "#b45309" }}>
                        <span style={{ fontWeight: 600 }}>Allergy: </span>{allergy}
                      </p>
                    )}
                    {order.specialInstructions && (
                      <p><span style={{ color: "#94a3b8", fontWeight: 600 }}>Special: </span>{order.specialInstructions}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569" }}>
                    <p><span style={{ color: "#94a3b8", fontWeight: 600 }}>Order #: </span>{order.orderNumber}</p>
                    <p><span style={{ color: "#94a3b8", fontWeight: 600 }}>Parent: </span>{order.parentName}</p>
                    <p><span style={{ color: "#94a3b8", fontWeight: 600 }}>Email: </span>{order.parentEmail}</p>
                    {order.student.classroom && (
                      <p><span style={{ color: "#94a3b8", fontWeight: 600 }}>Classroom: </span>{order.student.classroom}</p>
                    )}
                  </div>
                </div>

                {/* Actions row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f8fafc" }}>
                  <Link href={`/admin/orders/${order.id}`}
                    style={{ fontSize: 12, color: "#c41230", fontWeight: 600, textDecoration: "none" }}>
                    Edit order →
                  </Link>
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
