"use client";

/**
 * Discount builder — the natural-language live editor.
 *
 * Renders the discount as an English sentence with clickable pills,
 * one per editable field. Clicking a pill opens an inline popover
 * with the field-specific editor (number input, school picker, date
 * range, etc.). State flows up to this component immediately on every
 * change so the sentence stays live.
 *
 * Templates differ only in which pills are visible + their defaults.
 * The underlying data model is unified — see lib/validation/discount.ts.
 *
 * Slice 2 ships builders for three templates:
 *   WELCOME       — first-order automatic %
 *   PROMO_CODE    — customer-typed code
 *   SIBLING       — multi-item auto-discount
 *
 * The component handles both create and edit modes — passing in a
 * non-null `discountId` switches to edit (and the save action targets
 * updateDiscount instead of createDiscount).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DiscountPill } from "@/components/admin/discount-pill";
import { DiscountTemplateBadge, type DiscountIconName } from "@/components/admin/discount-icons";
import { createDiscount, updateDiscount } from "@/app/admin/(protected)/discounts/actions";
import type { TemplateMeta } from "@/lib/discount-templates";

/** Server actions that complete with redirect() throw a sentinel error
 *  with a `digest` starting with "NEXT_REDIRECT". If we swallow that
 *  in try/catch the redirect never happens and the user briefly sees
 *  the digest rendered as an error. Detect it and re-throw so Next's
 *  runtime handles it the way it wants. */
function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape the builder holds in state. Matches discountInputSchema but with
 *  strings/numbers as the form would post them (we coerce on save). */
export interface BuilderState {
  templateKind: TemplateMeta["kind"];
  name: string;
  description: string;
  code: string;
  kind: "PERCENT" | "FIXED_AMOUNT";
  /** Stored in display units: percent (1-100) or dollars (e.g. 3.00). */
  valueDisplay: string;
  scope: "ORDER" | "ITEMS";
  itemIds: string[];
  categories: string[];
  /** Stored in dollars for display; converted to cents on save. */
  minOrderDollars: string;
  minItemCount: string;
  firstOrderOnly: boolean;
  schoolIds: string[];
  weekdays: number[];
  startsAt: string; // yyyy-MM-dd
  endsAt: string;
  maxRedemptionsTotal: string;
  maxRedemptionsPerUser: string;
  allowStackingWithCode: boolean;
  isActive: boolean;
}

export interface DiscountBuilderProps {
  template: TemplateMeta;
  initial: BuilderState;
  schools: { id: string; name: string }[];
  menuItems: { id: string; name: string; category: string | null }[];
  /** When set, the builder operates in edit mode. */
  discountId?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DiscountBuilder({ template, initial, schools, menuItems, discountId }: DiscountBuilderProps) {
  const router = useRouter();
  const [state, setState] = useState<BuilderState>(initial);
  const [openPillId, setOpenPillId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const isEdit = Boolean(discountId);
  const update = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }));

  async function handleSave(asActive: boolean) {
    setError(null);
    const payload = serialize({ ...state, isActive: asActive });
    startSaving(async () => {
      try {
        if (isEdit && discountId) {
          await updateDiscount(discountId, payload);
          router.push(`/admin/discounts/${discountId}`);
          router.refresh();
        } else {
          await createDiscount(payload);
          // createDiscount redirects via Next's server-action redirect
          // mechanism — the await above won't return on success; it
          // throws a NEXT_REDIRECT sentinel that the catch below
          // re-throws so Next's runtime can act on it.
        }
      } catch (err) {
        // Don't swallow Next's redirect mechanism — re-throw so the
        // navigation actually happens. Anything else is a real error.
        if (isRedirectError(err)) throw err;
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  // ── Sentence renderers per template ──────────────────────────────────────

  return (
    <div className="min-h-screen bg-editorial-paper">
      <div className="max-w-3xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <DiscountTemplateBadge kind={template.kind as DiscountIconName} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-editorial-ink-soft">{template.title}</p>
            <input
              value={state.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Discount name"
              className="text-[20px] font-editorial font-semibold text-editorial-ink bg-transparent border-0 border-b-2 border-transparent focus:border-editorial-green focus:outline-none px-0 py-1 mt-0.5 w-full max-w-md"
            />
          </div>
        </div>

      {/* Promo code field — distinctively styled, only on PROMO_CODE template */}
      {template.kind === "PROMO_CODE" && (
        <div className="rounded-[16px] border border-editorial-line bg-editorial-paper-2 p-4 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-editorial-ink-soft mb-2">
            Customer enters this code
          </p>
          <div className="flex items-center gap-2">
            <input
              value={state.code}
              onChange={(e) => update({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
              placeholder="WELCOME20"
              maxLength={40}
              className="flex-1 font-mono text-[20px] font-bold text-editorial-ink bg-white border border-editorial-line rounded-[12px] px-3 py-2 tracking-wider focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
            />
            <button
              type="button"
              onClick={() => update({ code: generateCode() })}
              className="text-[11px] font-semibold px-3 py-2 rounded-full border border-editorial-line bg-white hover:border-editorial-green hover:text-editorial-green text-editorial-ink"
              title="Generate a random code"
            >
              ⟲ Random
            </button>
          </div>
          <p className="text-[11px] text-editorial-ink-soft mt-2">
            Letters and numbers only. Customers type this exactly at checkout — keep it short and memorable.
          </p>
        </div>
      )}

      {/* The sentence */}
      <div className="rounded-[16px] border border-editorial-line bg-white p-5 mb-5 text-[15px] leading-[2.2] text-editorial-ink shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        {/* Amount + main clause */}
        <AmountPill state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
        {" off "}

        {template.kind === "PROMO_CODE" ? (
          <>{"when customers enter the code at checkout."}</>
        ) : template.kind === "WELCOME" ? (
          <>
            {"on "}
            <span className="text-brand-800 font-semibold">their first order</span>
            {" "}
            <SchoolPill state={state} update={update} schools={schools} openPillId={openPillId} setOpenPillId={setOpenPillId} />
            {" "}
            <MinOrderPill state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
            {"."}
          </>
        ) : template.kind === "SIBLING" ? (
          <>
            {"when ordering for "}
            <SiblingCountPill state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
            {" "}
            <SchoolPill state={state} update={update} schools={schools} openPillId={openPillId} setOpenPillId={setOpenPillId} />
            {"."}
          </>
        ) : template.kind === "VOLUME" ? (
          <>
            {"on orders over "}
            <MinOrderPill state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
            {"."}
          </>
        ) : template.kind === "DAY_OF_WEEK" ? (
          <>
            <WeekdayPill state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
            {"."}
          </>
        ) : template.kind === "ITEM_DISCOUNT" ? (
          <>
            <ItemPill state={state} update={update} menuItems={menuItems} openPillId={openPillId} setOpenPillId={setOpenPillId} />
            {"."}
          </>
        ) : (
          // Fallback for templates whose builders aren't ready yet
          <>{" off any order."}</>
        )}
      </div>

      {/* Secondary controls — date window + limits.  Promo codes
          get the extra eligibility row (first-order toggle, school
          scope, min order) since the main sentence is just the
          code mechanism. */}
      {template.kind === "PROMO_CODE" && (
        <div className="rounded-[16px] border border-editorial-line bg-white px-5 py-3 mb-3 text-[14px] leading-[2.2] shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-1.5">Eligibility</p>
          <FirstOrderPill state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
          {" · "}
          <SchoolPill state={state} update={update} schools={schools} openPillId={openPillId} setOpenPillId={setOpenPillId} />
          {" · "}
          <MinOrderPill state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
        </div>
      )}

      <div className="rounded-[16px] border border-editorial-line bg-white px-5 py-3 mb-3 text-[14px] leading-[2.2] shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-1.5">Valid window</p>
        {"From "}
        <DatePill which="startsAt" state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
        {" through "}
        <DatePill which="endsAt" state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
        {"."}
      </div>

      <div className="rounded-[16px] border border-editorial-line bg-white px-5 py-3 mb-5 text-[14px] leading-[2.2] shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-1.5">Limits</p>
        <LimitPill which="total" state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
        {" · "}
        <LimitPill which="perUser" state={state} update={update} openPillId={openPillId} setOpenPillId={setOpenPillId} />
      </div>

      {/* Live preview — fake mini-receipt */}
      <LivePreview state={state} />

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-[16px] bg-[#F4E3DB] border border-[#E2C3B3] px-4 py-3 text-[13px] text-[#7C3D24]">
          {error}
        </div>
      )}

      {/* Save bar */}
      <div className="flex items-center justify-between gap-3 mt-6 pb-6">
        <button
          type="button"
          onClick={() => router.push("/admin/discounts")}
          className="text-[13px] text-editorial-ink-soft px-3 py-2 hover:text-editorial-ink"
          disabled={saving}
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 rounded-full border border-editorial-line bg-white text-[13px] font-semibold text-editorial-ink hover:border-editorial-green hover:text-editorial-green disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save as draft"}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-5 py-2 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Activate discount"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── Pill components ────────────────────────────────────────────────────────
// Each pill is a small wrapper around <DiscountPill> that owns its
// editor body + the rendered label logic. Co-located here so the
// builder file is self-contained.

interface PillSharedProps {
  state: BuilderState;
  update: (patch: Partial<BuilderState>) => void;
  openPillId: string | null;
  setOpenPillId: (id: string | null) => void;
}

function AmountPill({ state, update, openPillId, setOpenPillId }: PillSharedProps) {
  const label = state.kind === "PERCENT"
    ? `${state.valueDisplay || "0"}%`
    : `$${state.valueDisplay || "0"}`;
  return (
    <DiscountPill id="amount" label={label} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">Discount amount</p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => update({ kind: "PERCENT" })}
          className={`flex-1 px-2 py-1.5 rounded-[10px] text-[12px] font-semibold border ${
            state.kind === "PERCENT"
              ? "bg-editorial-sage border-editorial-green text-editorial-green"
              : "bg-white border-editorial-line text-editorial-ink-soft"
          }`}
        >
          Percent (%)
        </button>
        <button
          type="button"
          onClick={() => update({ kind: "FIXED_AMOUNT" })}
          className={`flex-1 px-2 py-1.5 rounded-[10px] text-[12px] font-semibold border ${
            state.kind === "FIXED_AMOUNT"
              ? "bg-editorial-sage border-editorial-green text-editorial-green"
              : "bg-white border-editorial-line text-editorial-ink-soft"
          }`}
        >
          Fixed ($)
        </button>
      </div>
      <div className="relative">
        {state.kind === "FIXED_AMOUNT" && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-editorial-ink-faint text-[14px]">$</span>
        )}
        <input
          type="number"
          step={state.kind === "PERCENT" ? 1 : 0.01}
          min={0}
          max={state.kind === "PERCENT" ? 100 : undefined}
          value={state.valueDisplay}
          onChange={(e) => update({ valueDisplay: e.target.value })}
          className={`w-full border border-editorial-line rounded-[10px] py-1.5 text-[14px] focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green ${
            state.kind === "FIXED_AMOUNT" ? "pl-6 pr-2" : "px-2"
          }`}
          autoFocus
        />
        {state.kind === "PERCENT" && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-editorial-ink-faint text-[14px]">%</span>
        )}
      </div>
    </DiscountPill>
  );
}

function SchoolPill({ state, update, schools, openPillId, setOpenPillId }: PillSharedProps & { schools: { id: string; name: string }[] }) {
  const isDefault = state.schoolIds.length === 0;
  const label = isDefault
    ? "at any school"
    : state.schoolIds.length === 1
    ? `at ${schools.find((s) => s.id === state.schoolIds[0])?.name ?? "selected"}`
    : `at ${state.schoolIds.length} schools`;
  function toggle(id: string) {
    update({
      schoolIds: state.schoolIds.includes(id)
        ? state.schoolIds.filter((x) => x !== id)
        : [...state.schoolIds, id],
    });
  }
  return (
    <DiscountPill id="schools" label={label} isDefault={isDefault} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">
        Which schools?
      </p>
      {schools.length === 0 ? (
        <p className="text-[12px] text-editorial-ink-soft italic">No active schools yet.</p>
      ) : (
        <div className="space-y-1">
          <label className="flex items-center gap-2 cursor-pointer text-[13px] text-editorial-ink">
            <input
              type="checkbox"
              checked={state.schoolIds.length === 0}
              onChange={() => update({ schoolIds: [] })}
              className="rounded"
            />
            All schools
          </label>
          {schools.map((s) => (
            <label key={s.id} className="flex items-center gap-2 cursor-pointer text-[13px] text-editorial-ink">
              <input
                type="checkbox"
                checked={state.schoolIds.includes(s.id)}
                onChange={() => toggle(s.id)}
                className="rounded"
              />
              {s.name}
            </label>
          ))}
        </div>
      )}
    </DiscountPill>
  );
}

function MinOrderPill({ state, update, openPillId, setOpenPillId }: PillSharedProps) {
  const num = Number(state.minOrderDollars);
  const isDefault = !num || num <= 0;
  const label = isDefault ? "for any cart total" : `on orders over $${state.minOrderDollars}`;
  return (
    <DiscountPill id="minOrder" label={label} isDefault={isDefault} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">Minimum order</p>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-editorial-ink-faint text-[14px]">$</span>
        <input
          type="number"
          step={1}
          min={0}
          placeholder="0"
          value={state.minOrderDollars}
          onChange={(e) => update({ minOrderDollars: e.target.value })}
          className="w-full border border-editorial-line rounded-[10px] pl-6 pr-2 py-1.5 text-[14px] focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
          autoFocus
        />
      </div>
      <button
        type="button"
        onClick={() => update({ minOrderDollars: "" })}
        className="text-[11px] text-editorial-ink-soft mt-2 hover:text-editorial-ink"
      >
        Clear — apply to any cart total
      </button>
    </DiscountPill>
  );
}

function SiblingCountPill({ state, update, openPillId, setOpenPillId }: PillSharedProps) {
  const n = parseInt(state.minItemCount, 10) || 2;
  const label = n >= 5 ? "5+ students" : `${n}+ students`;
  const options = [2, 3, 4, 5];
  return (
    <DiscountPill id="siblingCount" label={label} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">
        Minimum students per order
      </p>
      <div className="flex gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => update({ minItemCount: String(opt) })}
            className={`flex-1 px-2 py-1.5 rounded-[10px] text-[12px] font-semibold border ${
              n === opt
                ? "bg-editorial-sage border-editorial-green text-editorial-green"
                : "bg-white border-editorial-line text-editorial-ink-soft hover:border-editorial-green"
            }`}
          >
            {opt === 5 ? "5+" : `${opt}+`}
          </button>
        ))}
      </div>
    </DiscountPill>
  );
}

function FirstOrderPill({ state, update, openPillId, setOpenPillId }: PillSharedProps) {
  const isDefault = !state.firstOrderOnly;
  const label = isDefault ? "any customer" : "first-time customers only";
  return (
    <DiscountPill id="firstOrder" label={label} isDefault={isDefault} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">Who can use it</p>
      <div className="space-y-1">
        <label className="flex items-center gap-2 cursor-pointer text-[13px] text-editorial-ink">
          <input
            type="radio"
            name="firstOrder"
            checked={!state.firstOrderOnly}
            onChange={() => update({ firstOrderOnly: false })}
          />
          Anyone
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-[13px] text-editorial-ink">
          <input
            type="radio"
            name="firstOrder"
            checked={state.firstOrderOnly}
            onChange={() => update({ firstOrderOnly: true })}
          />
          First-time customers only
        </label>
      </div>
    </DiscountPill>
  );
}

function DatePill({
  which,
  state,
  update,
  openPillId,
  setOpenPillId,
}: PillSharedProps & { which: "startsAt" | "endsAt" }) {
  const v = state[which];
  const isDefault = !v;
  const label = isDefault
    ? which === "startsAt" ? "today" : "no expiry"
    : formatShortDate(v);
  return (
    <DiscountPill id={which} label={label} isDefault={isDefault} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">
        {which === "startsAt" ? "Starts on" : "Ends on"}
      </p>
      <input
        type="date"
        value={v}
        onChange={(e) => update({ [which]: e.target.value } as Partial<BuilderState>)}
        className="w-full border border-editorial-line rounded-[10px] px-2 py-1.5 text-[14px] focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
      />
      <button
        type="button"
        onClick={() => update({ [which]: "" } as Partial<BuilderState>)}
        className="text-[11px] text-editorial-ink-soft mt-2 hover:text-editorial-ink"
      >
        Clear — {which === "startsAt" ? "starts immediately" : "no expiry"}
      </button>
    </DiscountPill>
  );
}

function LimitPill({
  which,
  state,
  update,
  openPillId,
  setOpenPillId,
}: PillSharedProps & { which: "total" | "perUser" }) {
  const field = which === "total" ? "maxRedemptionsTotal" : "maxRedemptionsPerUser";
  const v = state[field];
  const n = parseInt(v, 10);
  const isDefault = !n;
  const label = isDefault
    ? which === "total" ? "no limit on total uses" : "no per-customer limit"
    : which === "total" ? `${n} total uses` : `${n} use${n === 1 ? "" : "s"} per customer`;
  return (
    <DiscountPill id={`limit-${which}`} label={label} isDefault={isDefault} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">
        {which === "total" ? "Total redemptions cap" : "Per-customer cap"}
      </p>
      <input
        type="number"
        step={1}
        min={0}
        placeholder="No limit"
        value={v}
        onChange={(e) => update({ [field]: e.target.value } as Partial<BuilderState>)}
        className="w-full border border-editorial-line rounded-[10px] px-2 py-1.5 text-[14px] focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
      />
      <button
        type="button"
        onClick={() => update({ [field]: "" } as Partial<BuilderState>)}
        className="text-[11px] text-editorial-ink-soft mt-2 hover:text-editorial-ink"
      >
        Clear — no limit
      </button>
    </DiscountPill>
  );
}

function WeekdayPill({ state, update, openPillId, setOpenPillId }: PillSharedProps) {
  const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const isDefault = state.weekdays.length === 0;
  const label = isDefault
    ? "any day"
    : state.weekdays.length === 1
    ? `on ${WEEKDAY_NAMES[state.weekdays[0] - 1]}s`
    : `on ${state.weekdays.length} days a week`;
  function toggle(isoDay: number) {
    update({
      weekdays: state.weekdays.includes(isoDay)
        ? state.weekdays.filter((x) => x !== isoDay)
        : [...state.weekdays, isoDay].sort((a, b) => a - b),
    });
  }
  return (
    <DiscountPill id="weekdays" label={label} isDefault={isDefault} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">
        Which days?
      </p>
      <div className="space-y-1">
        {WEEKDAY_NAMES.map((name, idx) => {
          const isoDay = idx + 1;
          return (
            <label key={isoDay} className="flex items-center gap-2 cursor-pointer text-[13px] text-editorial-ink">
              <input
                type="checkbox"
                checked={state.weekdays.includes(isoDay)}
                onChange={() => toggle(isoDay)}
                className="rounded"
              />
              {name}
            </label>
          );
        })}
      </div>
    </DiscountPill>
  );
}

function ItemPill({ state, update, menuItems, openPillId, setOpenPillId }: PillSharedProps & { menuItems: { id: string; name: string; category: string | null }[] }) {
  const isDefault = state.itemIds.length === 0 && state.categories.length === 0;
  const label = isDefault
    ? "any items"
    : state.itemIds.length === 1 && state.categories.length === 0
    ? menuItems.find((m) => m.id === state.itemIds[0])?.name ?? "selected"
    : state.categories.length === 1 && state.itemIds.length === 0
    ? `${state.categories[0]}`
    : `${(state.itemIds.length || 0) + (state.categories.length || 0)} selections`;

  // Group items by category for display
  const categories = new Map<string | null, typeof menuItems>();
  for (const item of menuItems) {
    const cat = item.category ?? "(Uncategorized)";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(item);
  }

  function toggleItem(itemId: string) {
    update({
      itemIds: state.itemIds.includes(itemId)
        ? state.itemIds.filter((x) => x !== itemId)
        : [...state.itemIds, itemId],
    });
  }

  function toggleCategory(cat: string) {
    update({
      categories: state.categories.includes(cat)
        ? state.categories.filter((x) => x !== cat)
        : [...state.categories, cat],
    });
  }

  return (
    <DiscountPill id="items" label={label} isDefault={isDefault} openPillId={openPillId} setOpenPillId={setOpenPillId}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-2">
        Which items?
      </p>
      {menuItems.length === 0 ? (
        <p className="text-[12px] text-editorial-ink-soft italic">No active menu items yet.</p>
      ) : (
        <div className="space-y-3">
          {Array.from(categories.entries()).map(([catName, items]) => (
            <div key={catName}>
              <label className="flex items-center gap-2 cursor-pointer text-[12px] font-semibold text-editorial-ink mb-1">
                <input
                  type="checkbox"
                  checked={state.categories.includes(catName!)}
                  onChange={() => toggleCategory(catName!)}
                  className="rounded"
                />
                {catName}
              </label>
              <div className="ml-5 space-y-1">
                {items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer text-[13px] text-editorial-ink">
                    <input
                      type="checkbox"
                      checked={state.itemIds.includes(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="rounded"
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DiscountPill>
  );
}

// ─── Live preview (mini-receipt) ───────────────────────────────────────────

function LivePreview({ state }: { state: BuilderState }) {
  // Mock cart subtotal for the preview. We pick something sensible
  // ($24 = a typical 2-kid order) so percent and fixed both show
  // numbers that read clearly.
  const mockSubtotal = 2400;
  const value = Number(state.valueDisplay) || 0;
  const discountCents =
    state.kind === "PERCENT"
      ? Math.floor((mockSubtotal * value) / 100)
      : Math.floor(value * 100);
  const finalCents = Math.max(0, mockSubtotal - discountCents);

  return (
    <div className="rounded-[16px] border border-editorial-line bg-editorial-paper-2 p-5 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-editorial-ink-faint mb-3">
        Live preview · sample $24 order
      </p>
      <div className="space-y-1.5 max-w-xs">
        <ReceiptRow label="Subtotal" value={fmt(mockSubtotal)} muted />
        <ReceiptRow
          label={state.name || "Discount"}
          value={`−${fmt(discountCents)}`}
          accent
        />
        <div className="border-t border-editorial-line my-1" />
        <ReceiptRow label="Customer pays" value={fmt(finalCents)} bold />
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, muted, accent, bold }: {
  label: string; value: string;
  muted?: boolean; accent?: boolean; bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-[13px] ${bold ? "font-bold text-editorial-ink" : muted ? "text-editorial-ink-soft" : accent ? "text-editorial-green font-semibold" : "text-editorial-ink-soft"}`}>
        {label}
      </span>
      <span className={`text-[13px] ${bold ? "font-bold text-editorial-ink text-[15px]" : accent ? "font-semibold text-editorial-green" : "text-editorial-ink-soft"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatShortDate(yyyyMmDd: string): string {
  if (!yyyyMmDd) return "";
  const [y, m, d] = yyyyMmDd.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return yyyyMmDd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function generateCode(): string {
  // 6-char alphanumeric. Avoid 0/O/1/I/L for legibility — operators
  // sometimes read these aloud to customers on the phone.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Convert builder display state into the JSON shape the server action
 *  expects. We re-validate on the server with zod, but converting here
 *  keeps the wire format honest (no stale "" strings, no display-vs-cents
 *  confusion). */
function serialize(s: BuilderState): string {
  const valueAsInt =
    s.kind === "PERCENT"
      ? Math.round(Number(s.valueDisplay) || 0)
      : Math.round((Number(s.valueDisplay) || 0) * 100);
  return JSON.stringify({
    templateKind: s.templateKind,
    name: s.name,
    description: s.description || undefined,
    code: s.code || undefined,
    kind: s.kind,
    value: valueAsInt,
    scope: s.scope,
    itemIds: s.itemIds,
    categories: s.categories,
    minOrderCents: s.minOrderDollars ? Math.round(Number(s.minOrderDollars) * 100) : undefined,
    minItemCount: s.minItemCount ? parseInt(s.minItemCount, 10) : undefined,
    firstOrderOnly: s.firstOrderOnly,
    schoolIds: s.schoolIds,
    weekdays: s.weekdays,
    startsAt: s.startsAt || undefined,
    endsAt: s.endsAt || undefined,
    maxRedemptionsTotal: s.maxRedemptionsTotal ? parseInt(s.maxRedemptionsTotal, 10) : undefined,
    maxRedemptionsPerUser: s.maxRedemptionsPerUser ? parseInt(s.maxRedemptionsPerUser, 10) : undefined,
    allowStackingWithCode: s.allowStackingWithCode,
    isActive: s.isActive,
  });
}
