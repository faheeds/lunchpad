"use client";

import { useState, useTransition } from "react";

export function OrderStatusActions({ orderId, isArchived }: { orderId: string; isArchived: boolean }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function update(action: string) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      setMessage(response.ok ? "Updated." : data.error || "Unable to update order.");
      if (response.ok) window.location.reload();
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {[
        { action: "resend_confirmation", label: "Resend email" },
        { action: "refund", label: "Mark refunded" },
        { action: "cancel", label: "Cancel" },
        { action: isArchived ? "unarchive" : "archive", label: isArchived ? "Unarchive" : "Archive" },
      ].map(({ action, label }) => (
        <button key={action} type="button" disabled={isPending} onClick={() => update(action)}
          className="px-2.5 py-1 rounded-full border border-slate-200 text-[11px] text-slate-600 disabled:opacity-40">
          {label}
        </button>
      ))}
      {message && <p className="text-[11px] text-slate-500 w-full mt-0.5">{message}</p>}
    </div>
  );
}
