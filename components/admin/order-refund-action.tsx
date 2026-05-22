"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ItemLevelRefundModal } from "@/components/admin/item-level-refund-modal";

interface OrderRefundActionProps {
  orderId: string;
  orderStatus: string;
  items: Array<{
    id: string;
    itemNameSnapshot: string;
    lineTotalCents: number;
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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isFullyRefunded = refundedAmountCents >= totalCents;
  const canRefund = orderStatus === "PAID" || orderStatus === "PARTIALLY_REFUNDED";
  // Only MANAGER and OWNER can refund
  const canRefundByRole = myRole !== "STAFF";

  async function handleRefund(amountCents: number) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/orders/refund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, amountCents }),
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.error || "Refund failed");
          return;
        }

        setIsOpen(false);
        router.refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Refund failed");
      }
    });
  }

  if (!canRefund || !canRefundByRole || isFullyRefunded) return null;

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setIsOpen(true)}
        className="px-2.5 py-1 rounded-full border border-editorial-line text-[11px] text-editorial-ink hover:border-editorial-green hover:text-editorial-green transition disabled:opacity-40"
      >
        {isPending ? "Processing..." : "Refund"}
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
        onClose={() => setIsOpen(false)}
        onSubmit={handleRefund}
        isLoading={isPending}
      />
    </>
  );
}
