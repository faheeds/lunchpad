"use client";

import { useState, useTransition } from "react";
import { RefundModal } from "@/components/admin/refund-modal";

interface RefundModalClientProps {
  orderId: string;
  orderStatus: string;
  orderNumber: string;
  totalCents: number;
  refundedAmountCents: number;
  parentName: string;
  studentName: string;
  onRefundSuccess?: () => void;
  refundAction: (
    orderId: string,
    amountCents: number,
  ) => Promise<{ success: boolean; error?: string }>;
}

export function RefundModalClient({
  orderId,
  orderStatus,
  orderNumber,
  totalCents,
  refundedAmountCents,
  parentName,
  studentName,
  onRefundSuccess,
  refundAction,
}: RefundModalClientProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isFullyRefunded = refundedAmountCents >= totalCents;
  const canRefund = orderStatus === "PAID" || orderStatus === "PARTIALLY_REFUNDED";

  async function handleRefund(amountCents: number) {
    startTransition(async () => {
      const result = await refundAction(orderId, amountCents);
      if (result.success) {
        onRefundSuccess?.();
      }
    });
  }

  if (!canRefund || isFullyRefunded) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        className="w-full py-2.5 rounded-lg border border-editorial-line text-sm font-bold text-editorial-ink hover:bg-editorial-paper disabled:opacity-50 transition"
      >
        {isPending ? "Processing refund..." : "Refund"}
      </button>

      <RefundModal
        isOpen={isOpen}
        orderId={orderId}
        totalCents={totalCents}
        refundedAmountCents={refundedAmountCents}
        parentName={parentName}
        studentName={studentName}
        onClose={() => setIsOpen(false)}
        onSubmit={handleRefund}
        isLoading={isPending}
      />
    </>
  );
}
