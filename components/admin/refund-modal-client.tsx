"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ItemLevelRefundModal } from "@/components/admin/item-level-refund-modal";

interface OrderItemForRefund {
  id: string;
  itemNameSnapshot: string;
  lineTotalCents: number;
  refundedAt: string | Date | null;
}

interface RefundModalClientProps {
  orderId: string;
  orderStatus: string;
  orderNumber: string;
  items: OrderItemForRefund[];
  totalCents: number;
  discountCents: number;
  refundedAmountCents: number;
  parentName: string;
  studentName: string;
  refundAction: (
    orderId: string,
    amountCents: number,
    itemIds: string[],
  ) => Promise<{ success: boolean; error?: string }>;
}

export function RefundModalClient({
  orderId,
  orderStatus,
  orderNumber,
  items,
  totalCents,
  discountCents,
  refundedAmountCents,
  parentName,
  studentName,
  refundAction,
}: RefundModalClientProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const isFullyRefunded = refundedAmountCents >= totalCents;
  const canRefund = orderStatus === "PAID" || orderStatus === "PARTIALLY_REFUNDED";

  // The server action returns { success, error } rather than throwing.
  // Convert a failure into a throw so the modal shows it inline; on
  // success, resolve so the modal renders its confirmation view.
  async function handleRefund(amountCents: number, itemIds: string[]) {
    setIsLoading(true);
    try {
      const result = await refundAction(orderId, amountCents, itemIds);
      if (!result.success) {
        throw new Error(result.error || "Refund failed");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    setIsOpen(false);
    router.refresh();
  }

  if (!canRefund || isFullyRefunded) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={isLoading}
        className="w-full py-2.5 rounded-lg border border-editorial-line text-sm font-bold text-editorial-ink hover:bg-editorial-paper disabled:opacity-50 transition"
      >
        {isLoading ? "Processing refund..." : "Refund"}
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
