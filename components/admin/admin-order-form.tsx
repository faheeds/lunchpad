"use client";

/**
 * Admin "+ New order" form. Single page (no progress steps) — admins know
 * what they're doing and want speed over hand-holding. Three sections,
 * stacked: Recipient, Items, Payment. Submit goes to /api/admin/orders/new.
 *
 * Payment modes:
 *   - stripe_link: server returns a Stripe Checkout URL; we copy to
 *                  clipboard + display so the admin can text/email it.
 *   - manual:      records an off-platform payment (cash/check/etc).
 *                  Admin picks method + optional reference + notes.
 *   - comped:      $0, optional reason.
 *
 * STAFF only see "stripe_link" — comping or recording manual payment
 * sidesteps Stripe revenue and is reserved for MANAGER+. The API
 * re-checks this; the UI just hides the disallowed options.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import type { LocationType } from "@prisma/client";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { getLabels } from "@/lib/location-labels";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

type MenuOption = {
  id: string;
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
};
type MenuItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  /** Operator-set required choices (e.g. Beef / Crispy Chicken / Vegan).
   *  Optional for back-compat — when empty the helper falls back to a
   *  hardcoded legacy slug map. */
  requiredChoices?: string[];
  options: MenuOption[];
};
type DeliveryDate = {
  id: string;
  schoolId: string;
  deliveryDate: string;
  cutoffAt: string;
  school: { id: string; name: string; timezone: string; locationType: LocationType };
  menuItems: MenuItem[];
};
type CartItem = {
  id: string;
  menuItemId: string;
  itemName: string;
  choice?: string;
  additions: string[];
  removals: string[];
  lineTotalCents: number;
};

type AdminRoleClient = "STAFF" | "MANAGER" | "OWNER";

type PaymentMode = "stripe_link" | "manual" | "comped";

const PAYMENT_MODE_OPTIONS: {
  value: PaymentMode;
  label: string;
  hint: string;
  minRole: AdminRoleClient;
}[] = [
  {
    value: "stripe_link",
    label: "Send Stripe Checkout link",
    hint: "Customer pays via Stripe. Order stays Pending until they complete payment.",
    minRole: "STAFF",
  },
  {
    value: "manual",
    label: "Record manual payment",
    hint: "Cash, check, Venmo, etc. Order is marked Paid immediately.",
    minRole: "MANAGER",
  },
  {
    value: "comped",
    label: "Comp this order",
    hint: "Free order. Total is $0; the kitchen sheet still shows the real items.",
    minRole: "MANAGER",
  },
];

const MANUAL_METHODS = ["cash", "check", "venmo", "zelle", "other"];

function roleAllows(myRole: AdminRoleClient, required: AdminRoleClient): boolean {
  const order: AdminRoleClient[] = ["STAFF", "MANAGER", "OWNER"];
  return order.indexOf(myRole) >= order.indexOf(required);
}

export function AdminOrderForm({
  deliveryDates,
  myRole,
}: {
  deliveryDates: DeliveryDate[];
  myRole: AdminRoleClient;
  restaurantTimezone: string;
}) {
  const router = useRouter();

  // Locations are derived from the available delivery dates so we never
  // show a location with nothing to order.
  const locations = useMemo(() => {
    const seen = new Map<string, DeliveryDate["school"]>();
    for (const d of deliveryDates) seen.set(d.school.id, d.school);
    return Array.from(seen.values());
  }, [deliveryDates]);

  const [selectedSchoolId, setSelectedSchoolId] = useState(locations[0]?.id ?? "");
  const [selectedDeliveryDateId, setSelectedDeliveryDateId] = useState("");

  // Recipient + parent fields
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("");
  const [allergyNotes, setAllergyNotes] = useState("");

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [activeMenuItemId, setActiveMenuItemId] = useState<string>("");
  const [activeChoice, setActiveChoice] = useState<string>("");
  const [activeAdditions, setActiveAdditions] = useState<string[]>([]);
  const [activeRemovals, setActiveRemovals] = useState<string[]>([]);

  // Payment
  const allowedModes = PAYMENT_MODE_OPTIONS.filter((m) => roleAllows(myRole, m.minRole));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(allowedModes[0]?.value ?? "stripe_link");
  const [manualMethod, setManualMethod] = useState<string>("cash");
  const [manualReference, setManualReference] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [compedReason, setCompedReason] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    orderNumber: string;
    checkoutUrl: string | null;
    mode: PaymentMode;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Derived data based on the picked location/date
  const selectedSchool = locations.find((s) => s.id === selectedSchoolId);
  const labels = getLabels(selectedSchool?.locationType);
  const isOffice = selectedSchool?.locationType === "OFFICE";
  const dateOptions = useMemo(
    () => deliveryDates.filter((d) => d.schoolId === selectedSchoolId),
    [deliveryDates, selectedSchoolId],
  );
  const selectedDate = deliveryDates.find((d) => d.id === selectedDeliveryDateId);
  const menuItems = selectedDate?.menuItems ?? [];

  // Default the date dropdown to the first option whenever location changes.
  useEffect(() => {
    if (!selectedSchoolId) {
      setSelectedDeliveryDateId("");
      return;
    }
    const firstForSchool = dateOptions[0]?.id ?? "";
    setSelectedDeliveryDateId((cur) => {
      if (cur && dateOptions.some((d) => d.id === cur)) return cur;
      return firstForSchool;
    });
  }, [selectedSchoolId, dateOptions]);

  // Reset the active customizer when the user picks a different item.
  useEffect(() => {
    setActiveChoice("");
    setActiveAdditions([]);
    setActiveRemovals([]);
  }, [activeMenuItemId]);

  // Past-cutoff warning — informational only; admins are allowed to post-cutoff.
  const cutoffPassed = selectedDate ? new Date(selectedDate.cutoffAt) < new Date() : false;

  const activeMenuItem = menuItems.find((m) => m.id === activeMenuItemId);
  const requiredChoices = activeMenuItem ? getRequiredChoicesForMenuItem(activeMenuItem) : [];
  const activeLineTotal = useMemo(() => {
    if (!activeMenuItem) return 0;
    const extras = activeMenuItem.options
      .filter((o) => o.optionType === "ADD_ON" && activeAdditions.includes(o.name))
      .reduce((sum, o) => sum + o.priceDeltaCents, 0);
    return activeMenuItem.basePriceCents + extras;
  }, [activeMenuItem, activeAdditions]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.lineTotalCents, 0), [cartItems]);

  function toggle(value: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(value) ? current.filter((i) => i !== value) : [...current, value]);
  }

  function addItemToCart() {
    if (!activeMenuItem) return;
    if (requiredChoices.length && !activeChoice) {
      setError(`Choose a required option for ${activeMenuItem.name}.`);
      return;
    }
    setCartItems((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        menuItemId: activeMenuItem.id,
        itemName: activeMenuItem.name,
        choice: activeChoice || undefined,
        additions: activeAdditions,
        removals: activeRemovals,
        lineTotalCents: activeLineTotal,
      },
    ]);
    setActiveMenuItemId("");
    setError("");
  }

  function removeFromCart(id: string) {
    setCartItems((cur) => cur.filter((i) => i.id !== id));
  }

  async function handleSubmit() {
    setError("");
    if (!selectedDate) {
      setError("Pick a location and delivery date.");
      return;
    }
    if (!parentName || !parentEmail) {
      setError("Parent name and email are required (used for the receipt).");
      return;
    }
    if (!studentName) {
      setError(`${labels.unitName} is required.`);
      return;
    }
    if (!isOffice && !grade) {
      setError("Grade is required for school orders.");
      return;
    }
    if (!cartItems.length) {
      setError("Add at least one item to the cart.");
      return;
    }

    let mode:
      | { kind: "stripe_link" }
      | { kind: "manual"; method: string; reference?: string; notes?: string }
      | { kind: "comped"; reason?: string };
    if (paymentMode === "stripe_link") {
      mode = { kind: "stripe_link" };
    } else if (paymentMode === "manual") {
      mode = {
        kind: "manual",
        method: manualMethod,
        reference: manualReference || undefined,
        notes: manualNotes || undefined,
      };
    } else {
      mode = { kind: "comped", reason: compedReason || undefined };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName,
          parentEmail,
          schoolId: selectedSchoolId,
          deliveryDateId: selectedDeliveryDateId,
          studentName,
          grade: isOffice ? "" : grade,
          allergyNotes: allergyNotes || undefined,
          cartItems: cartItems.map((c) => ({
            menuItemId: c.menuItemId,
            choice: c.choice,
            additions: c.additions,
            removals: c.removals,
          })),
          paymentMode: mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to create order.");
        return;
      }
      setResult({
        orderNumber: data.orderNumber,
        checkoutUrl: data.checkoutUrl ?? null,
        mode: paymentMode,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create order.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!result?.checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(result.checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail if the page isn't focused or the browser
      // doesn't grant access — fall back to selecting the link.
    }
  }

  // ── Success state ───────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="rounded-[14px] border border-green-100 bg-green-50/50 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-green-600 text-white w-8 h-8 flex items-center justify-center flex-shrink-0 text-[14px] font-bold">✓</div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-green-900">Order created</p>
            <p className="text-[12px] text-green-800 mt-0.5">Order number: <strong>{result.orderNumber}</strong></p>
          </div>
        </div>

        {result.mode === "stripe_link" && result.checkoutUrl && (
          <div className="rounded-xl bg-white border border-green-100 p-3 space-y-2">
            <p className="text-[12px] text-slate-700">
              Share this link with the customer to complete payment:
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={result.checkoutUrl}
                className="flex-1 rounded-lg border-slate-200 text-[11px] px-2 py-1.5 bg-slate-50"
              />
              <button
                type="button"
                onClick={copyLink}
                className="px-3 py-1.5 rounded-lg bg-ink text-white text-[11px] font-semibold whitespace-nowrap"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              The order stays Pending until the customer completes payment. You&apos;ll see it
              flip to Paid on the orders page automatically.
            </p>
          </div>
        )}

        {(result.mode === "manual" || result.mode === "comped") && (
          <p className="text-[12px] text-green-800">
            A confirmation email has been sent to <strong>{parentEmail}</strong>.
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push(`/admin/orders`)}
            className="flex-1 py-2 rounded-lg bg-ink text-white text-[12px] font-semibold"
          >
            Back to orders
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setCartItems([]);
              setStudentName("");
              setGrade("");
              setAllergyNotes("");
              setManualReference("");
              setManualNotes("");
              setCompedReason("");
              setError("");
            }}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-700 text-[12px] font-semibold"
          >
            Place another
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Where & when ───────────────────────────────────────────── */}
      <section className="rounded-[14px] border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Where & when</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Location</label>
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
            >
              {locations.length === 0 && <option value="">No active locations</option>}
              {locations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.locationType === "OFFICE" ? "· Office" : "· School"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Delivery date</label>
            <select
              value={selectedDeliveryDateId}
              onChange={(e) => setSelectedDeliveryDateId(e.target.value)}
              className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
            >
              {dateOptions.length === 0 && <option value="">No open dates for this location</option>}
              {dateOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE, MMM d")}{" "}
                  (cutoff {formatInTimeZone(d.cutoffAt, d.school.timezone, "MMM d h:mma")})
                </option>
              ))}
            </select>
          </div>
        </div>
        {cutoffPassed && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-900">
            ⚠ The cutoff for this delivery date has passed. The customer flow would block this; you can still create the order as an admin. Make sure the kitchen can accommodate it.
          </div>
        )}
      </section>

      {/* ── Recipient ─────────────────────────────────────────────── */}
      <section className="rounded-[14px] border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Recipient
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">
              {isOffice ? "Customer name" : "Parent name"}
            </label>
            <input
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">
              {isOffice ? "Customer email" : "Parent email"}
            </label>
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">{labels.unitName}</label>
            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder={isOffice ? "Recipient name" : "Student name"}
              className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
            />
          </div>
          {labels.showGrade && (
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">{labels.grade}</label>
              <input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder={labels.gradePlaceholder}
                className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
              />
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] text-slate-500 mb-1 block">
            Allergies / dietary notes
          </label>
          <textarea
            value={allergyNotes}
            onChange={(e) => setAllergyNotes(e.target.value)}
            placeholder="e.g. nut allergy, vegetarian"
            rows={2}
            className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2 resize-none"
          />
        </div>
      </section>

      {/* ── Items ─────────────────────────────────────────────────── */}
      <section className="rounded-[14px] border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Items</p>
        {!selectedDate ? (
          <p className="text-[12px] text-slate-400">Pick a location and delivery date to load the menu.</p>
        ) : menuItems.length === 0 ? (
          <p className="text-[12px] text-slate-400">No menu items available for this delivery date.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {menuItems.map((item) => {
                const isActive = activeMenuItemId === item.id;
                const inCartCount = cartItems.filter((c) => c.menuItemId === item.id).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveMenuItemId(isActive ? "" : item.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition",
                      isActive ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] font-semibold text-ink leading-snug">{item.name}</p>
                      <p className="text-[12px] font-semibold text-ink flex-shrink-0">
                        {formatCurrency(item.basePriceCents)}
                      </p>
                    </div>
                    {inCartCount > 0 && (
                      <p className="text-[10px] text-green-700 font-medium mt-1">
                        ✓ {inCartCount} in cart
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {activeMenuItem && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                <p className="text-[12px] font-semibold text-ink">Customize: {activeMenuItem.name}</p>
                {requiredChoices.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-ink mb-1.5">Required — choose one</p>
                    <div className="flex flex-wrap gap-1.5">
                      {requiredChoices.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setActiveChoice(c)}
                          className={cn(
                            "px-2.5 py-1 rounded-full border text-[11px]",
                            activeChoice === c
                              ? "border-brand-600 bg-brand-100 text-brand-900 font-semibold"
                              : "border-slate-200 bg-white text-slate-700",
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeMenuItem.options.filter((o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name)).length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-ink mb-1.5">Add-ons</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeMenuItem.options
                        .filter((o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name))
                        .map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => toggle(o.name, activeAdditions, setActiveAdditions)}
                            className={cn(
                              "px-2.5 py-1 rounded-full border text-[11px]",
                              activeAdditions.includes(o.name)
                                ? "border-brand-600 bg-brand-100 text-brand-900 font-semibold"
                                : "border-slate-200 bg-white text-slate-700",
                            )}
                          >
                            + {o.name}
                            {o.priceDeltaCents ? ` +${formatCurrency(o.priceDeltaCents)}` : ""}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                {activeMenuItem.options.filter((o) => o.optionType === "REMOVAL").length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-ink mb-1.5">Remove</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeMenuItem.options
                        .filter((o) => o.optionType === "REMOVAL")
                        .map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => toggle(o.name, activeRemovals, setActiveRemovals)}
                            className={cn(
                              "px-2.5 py-1 rounded-full border text-[11px]",
                              activeRemovals.includes(o.name)
                                ? "border-red-300 bg-red-100 text-red-900 font-semibold"
                                : "border-slate-200 bg-white text-slate-700",
                            )}
                          >
                            No {o.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={addItemToCart}
                    className="flex-1 py-2 rounded-lg bg-brand-700 text-white text-[12px] font-semibold"
                  >
                    Add to cart — {formatCurrency(activeLineTotal)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMenuItemId("")}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-[12px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {cartItems.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 divide-y divide-slate-200/60">
                {cartItems.map((c) => (
                  <div key={c.id} className="px-3 py-2 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-ink">{c.itemName}</p>
                      <p className="text-[11px] text-slate-500">
                        {[
                          c.choice,
                          c.additions.length ? `+ ${c.additions.join(", ")}` : "",
                          c.removals.length ? `No: ${c.removals.join(", ")}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No customizations"}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeFromCart(c.id)}
                        className="text-[10px] text-red-600 mt-0.5"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="text-[12px] font-semibold text-ink">{formatCurrency(c.lineTotalCents)}</p>
                  </div>
                ))}
                <div className="px-3 py-2 flex justify-between bg-white">
                  <span className="text-[12px] font-semibold text-ink">Total</span>
                  <span className="text-[14px] font-semibold text-ink">{formatCurrency(cartTotal)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Payment ───────────────────────────────────────────────── */}
      <section className="rounded-[14px] border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payment</p>
        <div className="space-y-2">
          {allowedModes.map((m) => (
            <label
              key={m.value}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition",
                paymentMode === m.value ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                name="paymentMode"
                value={m.value}
                checked={paymentMode === m.value}
                onChange={() => setPaymentMode(m.value)}
                className="mt-1 accent-brand-700"
              />
              <div>
                <p className="text-[12px] font-semibold text-ink">{m.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{m.hint}</p>
              </div>
            </label>
          ))}
        </div>

        {paymentMode === "manual" && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Method</label>
                <select
                  value={manualMethod}
                  onChange={(e) => setManualMethod(e.target.value)}
                  className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
                >
                  {MANUAL_METHODS.map((m) => (
                    <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Reference (optional)</label>
                <input
                  value={manualReference}
                  onChange={(e) => setManualReference(e.target.value)}
                  placeholder="Check #1234, Venmo handle, etc."
                  className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Notes (optional)</label>
              <input
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="e.g. paid in full at pickup"
                className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
              />
            </div>
          </div>
        )}

        {paymentMode === "comped" && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <label className="text-[11px] text-slate-500 mb-1 block">Reason (optional)</label>
            <input
              value={compedReason}
              onChange={(e) => setCompedReason(e.target.value)}
              placeholder="e.g. replaced burnt order, employee meal, marketing comp"
              className="w-full rounded-lg border-slate-200 text-[12px] py-2 px-2"
            />
          </div>
        )}
      </section>

      {error && (
        <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 py-3 rounded-lg bg-brand-700 text-white text-[13px] font-semibold disabled:opacity-50"
        >
          {submitting
            ? "Creating..."
            : paymentMode === "stripe_link"
              ? "Create order & generate link"
              : paymentMode === "manual"
                ? "Create paid order"
                : "Create comped order"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/orders")}
          className="px-4 py-3 rounded-lg border border-slate-200 text-slate-700 text-[12px] font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
