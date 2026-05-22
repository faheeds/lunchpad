"use client";

import { useState, useMemo, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

interface OrderItemForRefund {
  id: string;
  itemNameSnapshot: string;
  lineTotalCents: number;
  // Set once this item has been included in a refund. Already-refunded
  // items are shown greyed-out and can't be selected again.
  refundedAt: string | Date | null;
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
  onSubmit: (amountCents: number, itemIds: string[]) => Promise<void>;
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
  const [success, setSuccess] = useState<boolean>(false);
  const [submittedAmount, setSubmittedAmount] = useState<number>(0);

  // This component stays mounted across open/close (it returns null when
  // closed), so React keeps its state. Reset everything each time it
  // reopens — otherwise a stale success view or prior item selection
  // would still be on screen.
  useEffect(() => {
    if (isOpen) {
      setRefundType("full");
      setSelectedItemIds(new Set());
      setCustomAmount("");
      setError("");
      setSuccess(false);
      setSubmittedAmount(0);
    }
  }, [isOpen]);

  // Subtotal before order-level discount.
  const subtotalCents = totalCents + discountCents;

  // Apportion the order-level discount across items proportionally so the
  // per-item figure reflects what the customer actually paid for it.
  const itemPaidValues = useMemo(() => {
    const values: Record<string, number> = {};
    items.forEach((item) => {
      const discountShare =
        discountCents > 0 && subtotalCents > 0
          ? Math.round((item.lineTotalCents / subtotalCents) * discountCents)
          : 0;
      values[item.id] = item.lineTotalCents - discountShare;
    });
    return values;
  }, [items, subtotalCents, discountCents]);

  const refundableAmount = totalCents - refundedAmountCents;

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
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
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

    const amount = refundAmountCents;
    const itemIds = refundType === "items" ? Array.from(selectedItemIds) : [];

    try {
      await onSubmit(amount, itemIds);
      // onSubmit resolves only once the refund actually succeeded — show
      // an explicit success view rather than closing silently.
      setSubmittedAmount(amount);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed. Please try again.");
    }
  }

  if (!isOpen) return null;

  const submitDisabled =
    isLoading || (refundType === "items" && selectedItemIds.size === 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 px-6 py-4 border-b border-editorial-line bg-white">
          <h2 className="text-lg font-bold text-editorial-ink">
            {success ? "Refund issued" : "Issue refund"}
          </h2>
          <p className="text-sm text-editorial-ink-soft mt-1">
            {studentName} · {parentName}
          </p>
        </div>

        {success ? (
          <>
            {/* Success confirmation */}
            <div className="px-6 py-8 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-editorial-sage flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2C4031" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-xl font-bold text-editorial-ink">
                {formatCurrency(submittedAmount)} refunded
              </p>
              <p className="text-sm text-editorial-ink-soft mt-1.5">
                The refund was sent to Stripe. A confirmation email is on its way to {parentName}.
              </p>
            </div>
            <div className="sticky bottom-0 px-6 py-4 border-t border-editorial-line bg-white">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-lg bg-editorial-green text-white text-sm font-bold hover:bg-editorial-green-deep"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
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
                      const isRefunded = !!item.refundedAt;
                      const isSelected = selectedItemIds.has(item.id) && !isRefunded;
                      return (
                        <label
                          key={item.id}
                          className={`flex items-center gap-3 p-2 rounded transition ${
                            isRefunded
                              ? "opacity-60 cursor-not-allowed"
                              : isSelected
                              ? "bg-editorial-paper-2 cursor-pointer"
                              : "hover:bg-editorial-paper cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isRefunded}
                            onChange={() => {
                              if (!isRefunded) toggleItemSelection(item.id);
                            }}
                            className="w-4 h-4 rounded border-editorial-line accent-editorial-green flex-shrink-0 disabled:cursor-not-allowed"
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm ${
                                isRefunded
                                  ? "text-editorial-ink-faint line-through"
                                  : "text-editorial-ink"
                              }`}
                            >
                              {item.itemNameSnapshot}
                            </p>
                          </div>
                          {isRefunded ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-editorial-sage text-editorial-green flex-shrink-0">
                              Refunded
                            </span>
                          ) : (
                            <p className="text-sm font-semibold text-editorial-ink flex-shrink-0">
                              {formatCurrency(paidValue)}
                            </p>
                          )}
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
                disabled={submitDisabled}
                className="flex-1 px-4 py-2.5 rounded-lg bg-editorial-green text-white text-sm font-bold hover:bg-editorial-green-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Processing..." : "Issue refund"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
