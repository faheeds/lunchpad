"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function WeeklyCheckoutButton({ label = "Checkout upcoming week", className, fullWidth = false }: { label?: string; className?: string; fullWidth?: boolean }) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    setError("");
    const response = await fetch("/api/account/weekly-checkout", { method: "POST" });
    const data = await response.json();
    setIsPending(false);
    if (!response.ok) { setError(data.error || "Unable to start weekly checkout."); return; }
    window.location.href = data.checkoutUrl;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button type="button" onClick={handleClick} disabled={isPending}
        className={cn("px-4 py-2.5 rounded-xl bg-brand-700 text-white text-[13px] font-semibold disabled:opacity-50 transition", fullWidth ? "w-full" : "")}>
        {isPending ? "Starting checkout..." : label}
      </button>
      {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
    </div>
  );
}
