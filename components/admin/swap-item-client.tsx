"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export type SwapMenuItem = {
  id: string;
  name: string;
  category: string | null;
  basePriceCents: number;
  sizes: { name: string; priceCents: number }[];
  requiredChoices: string[];
  addOns: { name: string; priceDeltaCents: number }[];
  removals: string[];
};

export type SwapPayload = {
  orderItemId: string;
  newMenuItemId: string;
  size?: string;
  choice?: string;
  additions: string[];
  removals: string[];
  adminNote?: string;
  adjustment: "comped" | "manual" | "stripe_link";
  manualMethod?: string;
};

type SwapResult = { success: boolean; error?: string; checkoutUrl?: string };

interface Props {
  orderItemId: string;
  currentItemLabel: string;
  currentLineTotalCents: number;
  currentTotalCents: number;
  menuItems: SwapMenuItem[];
  swapAction: (payload: SwapPayload) => Promise<SwapResult>;
}

const inputCls =
  "w-full rounded-lg border border-editorial-line text-sm px-3 py-2 bg-white focus:border-editorial-green focus:ring-1 focus:ring-editorial-green";

export function SwapItemClient({
  orderItemId,
  currentItemLabel,
  currentLineTotalCents,
  currentTotalCents,
  menuItems,
  swapAction,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuItemId, setMenuItemId] = useState("");
  const [size, setSize] = useState("");
  const [choice, setChoice] = useState("");
  const [additions, setAdditions] = useState<string[]>([]);
  const [removals, setRemovals] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [adjustment, setAdjustment] = useState<SwapPayload["adjustment"]>("comped");
  const [manualMethod, setManualMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selected = menuItems.find((m) => m.id === menuItemId) ?? null;

  function pickItem(id: string) {
    setMenuItemId(id);
    const m = menuItems.find((x) => x.id === id);
    setSize(m?.sizes[0]?.name ?? "");
    setChoice("");
    setAdditions([]);
    setRemovals([]);
    setError(null);
  }

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // Live price preview — mirrors swapOrderItemAsAdmin (server is the source of truth).
  const preview = useMemo(() => {
    if (!selected) return null;
    const base = selected.sizes.length
      ? (selected.sizes.find((s) => s.name === size)?.priceCents ?? 0)
      : selected.basePriceCents;
    const addOnTotal = selected.addOns
      .filter((a) => additions.includes(a.name))
      .reduce((sum, a) => sum + a.priceDeltaCents, 0);
    const newLine = base + addOnTotal;
    // Order-level discount is kept as a fixed amount, so only the line moves.
    const newTotal = Math.max(0, currentTotalCents - currentLineTotalCents + newLine);
    return { newLine, newTotal, delta: newTotal - currentTotalCents };
  }, [selected, size, additions, currentTotalCents, currentLineTotalCents]);

  const needsSize = !!selected && selected.sizes.length > 0;
  const needsChoice = !!selected && selected.requiredChoices.length > 0;
  const canSubmit =
    !!selected && (!needsSize || !!size) && (!needsChoice || !!choice) && !busy &&
    (preview?.delta !== undefined && preview.delta > 0 && adjustment === "manual" ? manualMethod.trim().length > 0 : true);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await swapAction({
        orderItemId,
        newMenuItemId: selected.id,
        size: needsSize ? size : undefined,
        choice: needsChoice ? choice : undefined,
        additions,
        removals,
        adminNote: note.trim() || undefined,
        adjustment,
        manualMethod: manualMethod.trim() || undefined,
      });
      if (!res.success) {
        setError(res.error || "Swap failed.");
      } else if (res.checkoutUrl) {
        setCheckoutUrl(res.checkoutUrl);
      } else {
        setDone(true);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Swap failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2.5 rounded-full border border-editorial-green text-editorial-green text-sm font-semibold bg-white cursor-pointer hover:bg-editorial-paper-2 transition"
      >
        Swap item…
      </button>
    );
  }

  if (done) {
    return (
      <div className="rounded-lg bg-editorial-paper-2 px-3 py-3 space-y-2">
        <p className="text-sm font-semibold text-editorial-ink">Item swapped.</p>
        <button type="button" onClick={() => { setOpen(false); setDone(false); setMenuItemId(""); setNote(""); }}
          className="text-[12px] text-editorial-green underline bg-transparent border-none cursor-pointer p-0">
          Close
        </button>
      </div>
    );
  }

  if (checkoutUrl) {
    return (
      <div className="rounded-lg bg-editorial-paper-2 px-3 py-3 space-y-2">
        <p className="text-sm font-semibold text-editorial-ink">Payment link created</p>
        <p className="text-[11px] text-editorial-ink-soft">
          Send this link to the parent. The order switches to the new item once they pay the difference.
        </p>
        <input readOnly value={checkoutUrl} onFocus={(e) => e.currentTarget.select()} className={inputCls} />
        <button type="button" onClick={() => { navigator.clipboard?.writeText(checkoutUrl).catch(() => {}); }}
          className="text-[12px] text-editorial-green underline bg-transparent border-none cursor-pointer p-0">
          Copy link
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-editorial-ink-soft">
        Replacing <strong className="text-editorial-ink">{currentItemLabel}</strong> ({formatCurrency(currentLineTotalCents)})
      </p>

      <div>
        <label className="text-[11px] text-editorial-ink-soft mb-1 block">New item</label>
        <select value={menuItemId} onChange={(e) => pickItem(e.target.value)} className={inputCls}>
          <option value="">Select an item…</option>
          {menuItems.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}{m.category ? ` — ${m.category}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          {needsSize && (
            <div>
              <label className="text-[11px] text-editorial-ink-soft mb-1 block">Size</label>
              <select value={size} onChange={(e) => setSize(e.target.value)} className={inputCls}>
                {selected.sizes.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} — {formatCurrency(s.priceCents)}</option>
                ))}
              </select>
            </div>
          )}

          {needsChoice && (
            <div>
              <label className="text-[11px] text-editorial-ink-soft mb-1 block">Required choice</label>
              <select value={choice} onChange={(e) => setChoice(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {selected.requiredChoices.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {(selected.addOns.length > 0 || selected.removals.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-editorial-ink-soft mb-2">Add-ons</p>
                <div className="space-y-1.5">
                  {selected.addOns.length === 0 && <p className="text-[11px] text-editorial-ink-faint">None</p>}
                  {selected.addOns.map((a) => (
                    <label key={a.name} className="flex items-center gap-2 text-sm text-editorial-ink-soft cursor-pointer">
                      <input type="checkbox" checked={additions.includes(a.name)}
                        onChange={() => toggle(additions, setAdditions, a.name)}
                        className="rounded border-editorial-line accent-editorial-green" />
                      {a.name}
                      {a.priceDeltaCents > 0 && <span className="text-editorial-ink-faint">+{formatCurrency(a.priceDeltaCents)}</span>}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-editorial-ink-soft mb-2">Removals</p>
                <div className="space-y-1.5">
                  {selected.removals.length === 0 && <p className="text-[11px] text-editorial-ink-faint">None</p>}
                  {selected.removals.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm text-editorial-ink-soft cursor-pointer">
                      <input type="checkbox" checked={removals.includes(r)}
                        onChange={() => toggle(removals, setRemovals, r)}
                        className="rounded border-editorial-line accent-editorial-green" />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {preview && (
            <div className="rounded-lg bg-editorial-paper-2 px-3 py-2.5">
              <p className="text-[11px] text-editorial-ink-soft">New order total</p>
              <p className="text-lg font-semibold text-editorial-ink">{formatCurrency(preview.newTotal)}</p>
              <p className="text-[11px] text-editorial-ink-soft mt-0.5">
                {preview.delta === 0
                  ? "Same price — no money moves."
                  : preview.delta < 0
                    ? `${formatCurrency(-preview.delta)} will be refunded to the parent.`
                    : `${formatCurrency(preview.delta)} more than the parent paid.`}
              </p>
            </div>
          )}

          {preview && preview.delta > 0 && (
            <div>
              <label className="text-[11px] text-editorial-ink-soft mb-1 block">How is the extra {formatCurrency(preview.delta)} handled?</label>
              <select value={adjustment} onChange={(e) => setAdjustment(e.target.value as SwapPayload["adjustment"])} className={inputCls}>
                <option value="comped">Waive it (restaurant absorbs the difference)</option>
                <option value="manual">Collected outside the app (cash / Venmo / etc.)</option>
                <option value="stripe_link">Send the parent a payment link</option>
              </select>
              {adjustment === "manual" && (
                <input value={manualMethod} onChange={(e) => setManualMethod(e.target.value)}
                  placeholder="Method, e.g. cash" className={`${inputCls} mt-2`} />
              )}
            </div>
          )}

          <div>
            <label className="text-[11px] text-editorial-ink-soft mb-1 block">Admin note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="e.g. Parent called — wants the chicken bowl instead"
              className={`${inputCls} resize-none`} />
          </div>
        </>
      )}

      {error && <p className="text-[12px] text-editorial-clay font-medium">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={busy}
          className="flex-1 py-2.5 rounded-full border border-editorial-line text-sm text-editorial-ink-soft bg-white cursor-pointer">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="flex-1 py-2.5 rounded-full text-white text-sm font-bold border-none cursor-pointer bg-editorial-green hover:bg-editorial-green-deep disabled:opacity-50 disabled:cursor-not-allowed transition">
          {busy ? "Swapping…" : "Confirm swap"}
        </button>
      </div>
    </div>
  );
}
