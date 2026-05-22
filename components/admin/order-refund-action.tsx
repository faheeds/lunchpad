"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ItemLevelRefundModal } from "@/components/admin/item-level-refund-modal";

interface OrderRefundActionProps {
  orderId: string;
  orderStatus: string;
  items: Array<{
    id: string;
    itemNameSnapshot: string;
    lineTotalCents: number;
    refundedAt: string | Date | null;
  }>;
  totalCents: number;
  discountCents: number;
  refundedAmountCents: number;
  parentName: string;
  studentName: string;
  myRole: "STAFF" | "MANAGER" | "OWNER";
}

export function OrderRefundAction({
  orderId,
  orderStatus,
  items,
  totalCents,
  discountCents,
  refundedAmountCents,
  parentName,
  studentName,
  myRole,
}: OrderRefundActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const isFullyRefunded = refundedAmountCents >= totalCents;
  const canRefund = orderStatus === "PAID" || orderStatus === "PARTIALLY_REFUNDED";
  // Only MANAGER and OWNER can refund.
  const canRefundByRole = myRole !== "STAFF";

  // Resolves only when the refund actually completes; throws on failure
  // so the modal can show the error inline and the success view.
  async function handleRefund(amountCents: number, itemIds: string[]) {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/orders/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, amountCents, itemIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Refund failed");
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Refresh on close (not on submit) so the modal's success view stays
  // visible — refreshing immediately can unmount this component when the
  // order flips to fully-refunded.
  function handleClose() {
    setIsOpen(false);
    router.refresh();
  }

  if (!canRefund || !canRefundByRole || isFullyRefunded) return null;

  return (
    <>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => setIsOpen(true)}
        className="px-2.5 py-1 rounded-full border border-editorial-line text-[11px] text-editorial-ink hover:border-editorial-green hover:text-editorial-green transition disabled:opacity-40"
      >
        {isLoading ? "Processing..." : "Refund"}
      </button>

      <ItemLevelRefundModal
        isOpen={isOpen}
        orderId={orderId}
        items={items}
        totalCents={totalCents}
        discountCents={discountCents}
        refundedAmountCents={refundedAmountCents}
        parentName={parentName}
        studentName={studentName}
        onClose={handleClose}
        onSubmit={handleRefund}
        isLoading={isLoading}
      />
    </>
  );
}
