"use client";

import { useEffect, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";

type PreviewLine = {
  date: string;
  weekdayLabel: string;
  studentName: string;
  itemName: string;
  lineTotalCents: number;
  discountCents: number;
  discountName: string | null;
};

type Preview = {
  lines: PreviewLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountNames: string[];
  skipped: string[];
};

export function WeeklyCheckoutButton({ label = "Checkout upcoming week", className, fullWidth = false, week }: { label?: string; className?: string; fullWidth?: boolean; week?: "current" | "next" }) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  // Show the week's total — and any discount — BEFORE sending the parent to
  // Stripe, where the coupon line is collapsed behind a small arrow. A failed
  // or empty preview just hides the summary; the checkout button still works.
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    fetch(`/api/account/weekly-checkout/preview${week ? `?week=${week}` : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.preview?.lines?.length) setPreview(data.preview as Preview);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [week]);

  async function handleClick() {
    setIsPending(true);
    setError("");
    const response = await fetch("/api/account/weekly-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week }),
    });
    const data = await response.json();
    setIsPending(false);
    if (!response.ok) { setError(data.error || "Unable to start weekly checkout."); return; }
    window.location.href = data.checkoutUrl;
  }

  const saving = preview && preview.discountCents > 0;
  const buttonLabel = isPending
    ? "Starting checkout..."
    : preview
      ? `${label} · ${formatCurrency(preview.totalCents)}${saving ? ` (you save ${formatCurrency(preview.discountCents)})` : ""}`
      : label;

  return (
    <div className={cn("space-y-2", className)}>
      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-[12px] text-slate-700 space-y-2">
          {saving && (
            <p className="rounded-lg bg-emerald-50 text-emerald-800 font-semibold px-2.5 py-1.5">
              You&apos;re saving {formatCurrency(preview.discountCents)} this week
              {preview.discountNames.length === 1 ? ` with ${preview.discountNames[0]}` : ""}
            </p>
          )}
          <ul className="space-y-1">
            {preview.lines.map((line, i) => (
              <li key={`${line.date}-${i}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-medium">{line.weekdayLabel}</span>
                  <span className="text-slate-500"> · {line.studentName}: {line.itemName}</span>
                  {line.discountCents > 0 && (
                    <span className="block text-emerald-700">
                      {line.discountName ?? "Discount"} −{formatCurrency(line.discountCents)}
                    </span>
                  )}
                </span>
                <span className="flex-shrink-0 text-right">
                  {line.discountCents > 0 ? (
                    <>
                      <span className="line-through text-slate-400 mr-1.5">{formatCurrency(line.lineTotalCents)}</span>
                      <span className="font-semibold text-emerald-700">{formatCurrency(line.lineTotalCents - line.discountCents)}</span>
                    </>
                  ) : (
                    formatCurrency(line.lineTotalCents)
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 pt-2 space-y-0.5">
            {saving && (
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{formatCurrency(preview.subtotalCents)}</span>
              </div>
            )}
            {saving && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount</span>
                <span>−{formatCurrency(preview.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Total (before tax)</span>
              <span>{formatCurrency(preview.totalCents)}</span>
            </div>
          </div>
          {preview.skipped.length > 0 && (
            <p className="text-[11px] text-amber-700">
              {preview.skipped.length} planned {preview.skipped.length === 1 ? "day isn't" : "days aren't"} included (ordering closed or unavailable).
            </p>
          )}
        </div>
      )}
      <button type="button" onClick={handleClick} disabled={isPending}
        className={cn("px-4 py-2.5 rounded-xl bg-brand-700 text-white text-[13px] font-semibold disabled:opacity-50 transition", fullWidth ? "w-full" : "")}>
        {buttonLabel}
      </button>
      {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
    </div>
  );
}
