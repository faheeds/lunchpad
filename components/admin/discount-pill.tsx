"use client";

/**
 * Discount builder pill — a clickable inline button that pops a small
 * editor below it. The button text is the rendered value (e.g. "10%",
 * "any school"); the popover is whatever children you pass in.
 *
 * UX rules baked in:
 *  - Single popover open at a time across the whole builder. The
 *    parent owns the open-pill id so multiple <Pill>s can coordinate
 *    without prop-drilling state.
 *  - Outside-click + Escape close the popover and the edit is "saved"
 *    by virtue of the parent already holding the state (we don't have
 *    a separate draft/commit — each edit immediately flows up).
 *  - Empty / default values render in a quieter color so the sentence
 *    visually reads as "the bits that matter are highlighted."
 *
 * Why an inline custom popover instead of a library:
 *  - We don't need positioning logic (the popover lives in normal flow,
 *    just absolute-positioned below the pill).
 *  - No focus trap because nothing inside is keyboard-hostile — text
 *    inputs / checkboxes work natively.
 *  - Lighter than pulling in a primitive like Radix for one place.
 */

import { useEffect, useRef, type ReactNode } from "react";

export interface DiscountPillProps {
  /** Unique id for this pill within the builder (e.g. "amount", "schools"). */
  id: string;
  /** The currently-rendered value text inside the pill. */
  label: ReactNode;
  /** True when this value is the "default / no constraint" state, e.g.
   *  "any school". Renders in a muted color so the eye skips it when
   *  scanning the sentence. */
  isDefault?: boolean;
  /** Parent-owned open state — the parent tracks which pill is open. */
  openPillId: string | null;
  setOpenPillId: (id: string | null) => void;
  /** Editor body. Rendered inside the popover when this pill is open. */
  children: ReactNode;
}

export function DiscountPill({
  id,
  label,
  isDefault,
  openPillId,
  setOpenPillId,
  children,
}: DiscountPillProps) {
  const open = openPillId === id;
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Outside click + Escape to close. We attach listeners only while the
  // popover is open to avoid pointless work on every pill in the page.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        popRef.current?.contains(target) ||
        btnRef.current?.contains(target)
      ) {
        return;
      }
      setOpenPillId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenPillId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpenPillId]);

  return (
    <span className="relative inline-block align-baseline">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpenPillId(open ? null : id)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[14px] font-semibold transition ${
          open
            ? "bg-editorial-green text-editorial-paper border-editorial-green"
            : isDefault
            ? "bg-editorial-paper-2 text-editorial-ink-soft border-editorial-line hover:border-editorial-green hover:bg-editorial-paper"
            : "bg-editorial-sage text-editorial-green border-editorial-line hover:border-editorial-green"
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          className="absolute z-30 left-0 top-[calc(100%+6px)] min-w-[260px] rounded-[12px] bg-white border border-editorial-line shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)] p-3 text-[13px]"
        >
          {children}
        </div>
      )}
    </span>
  );
}
