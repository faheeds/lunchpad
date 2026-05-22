"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";

interface RefundModalProps {
  isOpen: boolean;
  orderId: string;
  totalCents: number;
  refundedAmountCents: number;
  parentName: string;
  studentName: string;
  onClose: () => void;
  onSubmit: (amountCents: number) => Promise<void>;
  isLoading?: boolean;
}

export function RefundModal({
  isOpen,
  orderId,
  totalCents,
  refundedAmountCents,
  parentName,
  studentName,
  onClose,
  onSubmit,
  isLoading = false,
}: RefundModalProps) {
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  const refundableAmount = totalCents - refundedAmountCents;
  const refundAmountCents = refundType === "full" ? refundableAmount : parseInt(partialAmount || "0") * 100;

  async function handleSubmit() {
    setError("");

    if (refundType === "partial") {
      if (!partialAmount || parseFloat(partialAmount) <= 0) {
        setError("Please enter a valid refund amount.");
        return;
      }
      const amountInCents = Math.round(parseFloat(partialAmount) * 100);
      if (amountInCents > refundableAmount) {
        setError(`Refund amount cannot exceed ${formatCurrency(refundableAmount)}.`);
        return;
      }
    }

    try {
      await onSubmit(refundAmountCents);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed. Please try again.");
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-editorial-line">
          <h2 className="text-lg font-bold text-editorial-ink">Issue refund</h2>
          <p className="text-sm text-editorial-ink-soft mt-1">
            {studentName} · {parentName}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Refund type selector */}
          <div>
            <label className="text-sm font-semibold text-editorial-ink-soft mb-2 block">
              Refund type
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="refund-type"
                  value="full"
                  checked={refundType === "full"}
                  onChange={() => {
                    setRefundType("full");
                    setError("");
                  }}
                  className="rounded border-editorial-line accent-editorial-green"
                />
                <span className="text-sm text-editorial-ink">
                  Full refund ({formatCurrency(refundableAmount)})
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="refund-type"
                  value="partial"
                  checked={refundType === "partial"}
                  onChange={() => {
                    setRefundType("partial");
                    setError("");
                  }}
                  className="rounded border-editorial-line accent-editorial-green"
                />
                <span className="text-sm text-editorial-ink">Partial refund</span>
              </label>
            </div>
          </div>

          {/* Partial amount input */}
          {refundType === "partial" && (
            <div>
              <label className="text-sm font-semibold text-editorial-ink-soft mb-2 block">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-editorial-ink-soft">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(refundableAmount / 100).toFixed(2)}
                  value={partialAmount}
                  onChange={(e) => {
                    setPartialAmount(e.target.value);
                    setError("");
                  }}
                  placeholder="0.00"
                  className="w-full pl-6 pr-3 py-2 rounded-lg border border-editorial-line text-sm focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                />
              </div>
              <p className="text-[11px] text-editorial-ink-soft mt-1">
                Max: {formatCurrency(refundableAmount)}
              </p>
            </div>
          )}

          {/* Refund info */}
          <div className="rounded-lg bg-editorial-paper-2 px-3 py-2.5">
            <p className="text-[11px] text-editorial-ink-soft mb-1">Refund amount</p>
            <p className="text-lg font-bold text-editorial-ink">{formatCurrency(refundAmountCents)}</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Info banner */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <p className="text-[11px] text-blue-700 font-medium">
              A refund confirmation email will be sent to the customer.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-editorial-line flex gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-editorial-line text-sm font-bold text-editorial-ink hover:bg-editorial-paper disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || (refundType === "partial" && !partialAmount)}
            className="flex-1 px-4 py-2.5 rounded-lg bg-editorial-green text-white text-sm font-bold hover:bg-editorial-green-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Issue refund"}
          </button>
        </div>
      </div>
    </div>
  );
}
