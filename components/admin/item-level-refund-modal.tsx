"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";

interface OrderItemForRefund {
  id: string;
  itemNameSnapshot: string;
  lineTotalCents: number;
}

interface ItemLevelRefundModalProps {
  isOpen: boolean;
  orderId: string;
  items: OrderItemForRefund[];
  totalCents: number;
  discountCents: number;
  refundedAmountCents: number;
  parentName: string;
  studentName: string;
  onClose: () => void;
  onSubmit: (amountCents: number) => Promise<void>;
  isLoading?: boolean;
}

export function ItemLevelRefundModal({
  isOpen,
  orderId,
  items,
  totalCents,
  discountCents,
  refundedAmountCents,
  parentName,
  studentName,
  onClose,
  onSubmit,
  isLoading = false,
}: ItemLevelRefundModalProps) {
  const [refundType, setRefundType] = useState<"full" | "items" | "custom">("full");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [customAmount, setCustomAmount] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Calculate subtotal (before discount)
  const subtotalCents = totalCents + discountCents;

  // Calculate discount per item proportionally
  const itemPaidValues = useMemo(() => {
    const values: Record<string, number> = {};
    items.forEach((item) => {
      const discountShare = discountCents > 0
        ? Math.round((item.lineTotalCents / subtotalCents) * discountCents)
        : 0;
      values[item.id] = item.lineTotalCents - discountShare;
    });
    return values;
  }, [items, subtotalCents, discountCents]);

  const refundableAmount = totalCents - refundedAmountCents;

  // Calculate refund amount based on selected type
  const refundAmountCents = useMemo(() => {
    if (refundType === "full") {
      return refundableAmount;
    } else if (refundType === "items") {
      const sum = Array.from(selectedItemIds).reduce(
        (acc, itemId) => acc + (itemPaidValues[itemId] || 0),
        0
      );
      return Math.min(sum, refundableAmount);
    } else {
      const amount = Math.round(parseFloat(customAmount || "0") * 100);
      return Math.min(amount, refundableAmount);
    }
  }, [refundType, selectedItemIds, customAmount, refundableAmount, itemPaidValues]);

  function toggleItemSelection(itemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  }

  async function handleSubmit() {
    setError("");

    if (refundType === "items" && selectedItemIds.size === 0) {
      setError("Please select at least one item to refund.");
      return;
    }

    if (refundType === "custom") {
      if (!customAmount || parseFloat(customAmount) <= 0) {
        setError("Please enter a valid refund amount.");
        return;
      }
      const amount = Math.round(parseFloat(customAmount) * 100);
      if (amount > refundableAmount) {
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
      <div className="bg-white rounded-[16px] max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 px-6 py-4 border-b border-editorial-line bg-white">
          <h2 className="text-lg font-bold text-editorial-ink">Issue refund</h2>
          <p className="text-sm text-editorial-ink-soft mt-1">
            {studentName} · {parentName}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Refund type selector */}
          <div>
            <label className="text-sm font-semibold text-editorial-ink-soft mb-3 block">
              Refund type
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-editorial-paper transition">
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
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-editorial-paper transition">
                <input
                  type="radio"
                  name="refund-type"
                  value="items"
                  checked={refundType === "items"}
                  onChange={() => {
                    setRefundType("items");
                    setError("");
                  }}
                  className="rounded border-editorial-line accent-editorial-green"
                />
                <span className="text-sm text-editorial-ink">Select items to refund</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-editorial-paper transition">
                <input
                  type="radio"
                  name="refund-type"
                  value="custom"
                  checked={refundType === "custom"}
                  onChange={() => {
                    setRefundType("custom");
                    setError("");
                  }}
                  className="rounded border-editorial-line accent-editorial-green"
                />
                <span className="text-sm text-editorial-ink">Custom amount</span>
              </label>
            </div>
          </div>

          {/* Item selection */}
          {refundType === "items" && items.length > 0 && (
            <div>
              <label className="text-sm font-semibold text-editorial-ink-soft mb-2 block">
                Select items to refund
              </label>
              <div className="space-y-2 border border-editorial-line rounded-lg p-3">
                {items.map((item) => {
                  const paidValue = itemPaidValues[item.id] || 0;
                  const isSelected = selectedItemIds.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer transition ${
                        isSelected ? "bg-editorial-paper-2" : "hover:bg-editorial-paper"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(item.id)}
                        className="w-4 h-4 rounded border-editorial-line accent-editorial-green flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-editorial-ink">{item.itemNameSnapshot}</p>
                      </div>
                      <p className="text-sm font-semibold text-editorial-ink flex-shrink-0">
                        {formatCurrency(paidValue)}
                      </p>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-editorial-ink-soft mt-2">
                Note: Prices shown reflect any order-level discounts apportioned to each item.
              </p>
            </div>
          )}

          {/* Custom amount input */}
          {refundType === "custom" && (
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
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
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

          {/* Refund summary */}
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
        <div className="sticky bottom-0 px-6 py-4 border-t border-editorial-line bg-white flex gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-editorial-line text-sm font-bold text-editorial-ink hover:bg-editorial-paper disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || (refundType === "items" && selectedItemIds.size === 0)}
            className="flex-1 px-4 py-2.5 rounded-lg bg-editorial-green text-white text-sm font-bold hover:bg-editorial-green-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Issue refund"}
          </button>
        </div>
      </div>
    </div>
  );
}
