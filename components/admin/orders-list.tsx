"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { OrderStatusActions } from "@/components/admin/order-status-actions";
import { formatCurrency, formatList } from "@/lib/utils";

type OrderListItem = {
  id: string; orderNumber: string; status: string; archivedAt: string | Date | null; createdAt: string | Date; totalCents: number; specialInstructions: string | null; parentName: string; parentEmail: string;
  school: { name: string; timezone: string };
  deliveryDate: { deliveryDate: string | Date };
  student: { studentName: string; grade: string; teacherName: string | null; classroom: string | null; allergyNotes: string | null };
  items: { itemNameSnapshot: string; additions: string[]; removals: string[]; allergyNotes: string | null }[];
};

function fmtDate(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone }).format(new Date(value));
}

const statusVariant: Record<string, string> = {
  PAID: "bg-brand-100 text-brand-900",
  PENDING: "bg-amber-100 text-amber-900",
  REFUNDED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export function OrdersList({ orders }: { orders: OrderListItem[] }) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const allSelected = useMemo(() => orders.length > 0 && orders.every((o) => selectedOrderIds.includes(o.id)), [orders, selectedOrderIds]);

  function toggleOrder(id: string) { setSelectedOrderIds((cur) => cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id]); }
  function toggleAll() { setSelectedOrderIds(allSelected ? [] : orders.map((o) => o.id)); }

  function runBulkAction(action: "archive" | "cancel" | "resend_confirmation") {
    if (!selectedOrderIds.length) { setMessage("Select at least one order first."); return; }
    startTransition(async () => {
      const response = await fetch("/api/admin/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, orderIds: selectedOrderIds }) });
      const data = await response.json();
      setMessage(response.ok ? `Updated ${data.updated} order${data.updated === 1 ? "" : "s"}.` : data.error || "Unable to update orders.");
      if (response.ok) { setSelectedOrderIds([]); window.location.reload(); }
    });
  }

  if (!orders.length) return <div className="rounded-[18px] border border-slate-100 bg-white px-4 py-6 text-center text-[13px] text-slate-500">No orders match the current filters.</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-[18px] border border-slate-100 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-slate-300" />
          Select all ({selectedOrderIds.length} selected)
        </label>
        <div className="flex gap-2 flex-wrap">
          {["archive", "cancel", "resend_confirmation"].map((action) => (
            <button key={action} type="button" disabled={isPending || !selectedOrderIds.length} onClick={() => runBulkAction(action as any)}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-[12px] text-slate-600 disabled:opacity-40">
              Bulk {action.replace("_", " ")}
            </button>
          ))}
        </div>
        {message && <p className="w-full text-[12px] text-slate-500">{message}</p>}
      </div>

      {orders.map((order) => (
        <div key={order.id} className="rounded-[18px] border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-3">
            <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleOrder(order.id)} className="rounded border-slate-300 h-4 w-4" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-semibold text-ink">{order.student.studentName}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusVariant[order.status] ?? "bg-slate-100 text-slate-600"}`}>{order.status}</span>
                {order.archivedAt && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Archived</span>}
              </div>
              <p className="text-[11px] text-slate-500">{order.school.name} · Grade {order.student.grade} · {fmtDate(order.deliveryDate.deliveryDate, order.school.timezone)}</p>
            </div>
            <p className="text-[14px] font-semibold text-ink flex-shrink-0">{formatCurrency(order.totalCents)}</p>
          </div>
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-slate-600">
            <div className="space-y-0.5">
              <p><span className="text-slate-400">Items:</span> {order.items.map((i) => i.itemNameSnapshot).join(", ")}</p>
              <p><span className="text-slate-400">Add-ons:</span> {formatList(order.items.flatMap((i) => i.additions))}</p>
              <p><span className="text-slate-400">Removals:</span> {formatList(order.items.flatMap((i) => i.removals))}</p>
              <p><span className="text-slate-400">Allergy:</span> {order.items.map((i) => i.allergyNotes).find(Boolean) || order.student.allergyNotes || "None"}</p>
            </div>
            <div className="space-y-0.5">
              <p><span className="text-slate-400">Order #:</span> {order.orderNumber}</p>
              <p><span className="text-slate-400">Parent:</span> {order.parentName} ({order.parentEmail})</p>
              <p><span className="text-slate-400">Special:</span> {order.specialInstructions || "None"}</p>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-slate-50 flex flex-wrap gap-2 items-center">
            <Link href={`/admin/orders/${order.id}`} className="text-[12px] text-brand-700 font-medium no-underline">Edit →</Link>
            <OrderStatusActions orderId={order.id} isArchived={Boolean(order.archivedAt)} />
          </div>
        </div>
      ))}
    </div>
  );
}
