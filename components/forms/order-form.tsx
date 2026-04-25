"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { getGradesForSchoolName } from "@/lib/grades";
import { cn } from "@/lib/utils";

type DeliveryDate = {
  id: string; schoolId: string; deliveryDate: string; cutoffAt: string; orderingOpen: boolean;
  school: { id: string; name: string; timezone: string };
};
type MenuOption = { id: string; name: string; optionType: "ADD_ON" | "REMOVAL"; priceDeltaCents: number };
type MenuItem = { id: string; slug: string; name: string; description: string | null; imageUrl: string | null; basePriceCents: number; options: MenuOption[] };
type CartItem = { id: string; menuItemId: string; itemName: string; choice?: string; additions: string[]; removals: string[]; lineTotalCents: number };

type OrderFormProps = {
  deliveryDates: DeliveryDate[];
  menuItemsByDeliveryDate: Record<string, MenuItem[]>;
  savedChildren?: { id: string; schoolId: string; studentName: string; grade: string; allergyNotes: string }[];
  initialParentProfile?: { parentName: string; parentEmail: string; parentChildId: string; studentName: string; grade: string; allergyNotes: string };
  initialSchoolId?: string;
  initialDeliveryDateId?: string;
  initialCartItems?: CartItem[];
  initialItemSlug?: string;
};

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const CATEGORY_ORDER = ["Signature Burgers & Sandwiches", "Salads with Protein", "Comfort Favorites", "Sides & Snacks"];

function getCategory(item: MenuItem) {
  const prefix = item.description?.split(".")[0]?.trim();
  if (prefix && CATEGORY_ORDER.includes(prefix)) return prefix;
  if (item.name.includes("Burger") || item.name.includes("Sandwich")) return "Signature Burgers & Sandwiches";
  if (item.name.includes("Salad")) return "Salads with Protein";
  if (item.name.includes("Mac") || item.name.includes("Quesadilla") || item.name.includes("Wings") || item.name.includes("Tender")) return "Comfort Favorites";
  return "Sides & Snacks";
}

function getDesc(item: MenuItem) {
  const parts = item.description?.split(". ");
  if (!parts?.length) return "";
  if (CATEGORY_ORDER.includes(parts[0].trim())) return parts.slice(1).join(". ").trim();
  return item.description ?? "";
}

const CATEGORY_ICONS: Record<string, string> = {
  "Signature Burgers & Sandwiches": "🍔",
  "Salads with Protein": "🥗",
  "Comfort Favorites": "🍗",
  "Sides & Snacks": "🍟",
};

// Steps: 1=school/date, 2=student, 3=menu, 4=review
type Step = 1 | 2 | 3 | 4;

export function OrderForm({
  deliveryDates, menuItemsByDeliveryDate, savedChildren = [],
  initialParentProfile, initialSchoolId, initialDeliveryDateId, initialCartItems = [],
  initialItemSlug
}: OrderFormProps) {
  const defaultSchoolId = initialSchoolId || "";
  const defaultDeliveryDateId = initialDeliveryDateId || "";

  const [step, setStep] = useState<Step>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState(defaultSchoolId);
  const [selectedDeliveryDateId, setSelectedDeliveryDateId] = useState(defaultDeliveryDateId);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [selectedAdditions, setSelectedAdditions] = useState<string[]>([]);
  const [selectedRemovals, setSelectedRemovals] = useState<string[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>(initialCartItems);
  const [error, setError] = useState("");
  const [selectedParentChildId, setSelectedParentChildId] = useState(initialParentProfile?.parentChildId ?? savedChildren[0]?.id ?? "");
  const [parentName, setParentName] = useState(initialParentProfile?.parentName ?? "");
  const [parentEmail, setParentEmail] = useState(initialParentProfile?.parentEmail ?? "");
  const [studentName, setStudentName] = useState(initialParentProfile?.studentName ?? "");
  const [grade, setGrade] = useState(initialParentProfile?.grade ?? "");
  const [allergyNotes, setAllergyNotes] = useState(initialParentProfile?.allergyNotes ?? "");
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const customizePanelRef = useRef<HTMLDivElement>(null);
  const itemSlugAutoSelected = useRef(false);

  // Scroll to the customize panel as soon as an item is selected
  useEffect(() => {
    if (selectedMenuItemId) {
      setTimeout(() => {
        customizePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [selectedMenuItemId]);

  // Sync form steps with browser history so the phone back button
  // navigates between steps instead of leaving the page entirely.
  useEffect(() => {
    window.history.replaceState({ orderStep: 1 }, "");
    function handlePopState(e: PopStateEvent) {
      const target = e.state?.orderStep as Step | undefined;
      if (target && target >= 1 && target <= 4) {
        setStep(target);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const schools = useMemo(() =>
    deliveryDates.reduce<DeliveryDate["school"][]>((acc, d) => {
      if (!acc.find((s) => s.id === d.school.id)) acc.push(d.school);
      return acc;
    }, []), [deliveryDates]);

  const selectedSchoolName = schools.find((s) => s.id === selectedSchoolId)?.name ?? "";
  const gradeOptions = getGradesForSchoolName(selectedSchoolName);

  const schoolDeliveryDates = useMemo(() => deliveryDates.filter((d) => d.school.id === selectedSchoolId), [deliveryDates, selectedSchoolId]);
  const selectedDelivery = deliveryDates.find((d) => d.id === selectedDeliveryDateId);
  const menuItems = menuItemsByDeliveryDate[selectedDeliveryDateId] ?? [];
  const selectedMenuItem = menuItems.find((item) => item.id === selectedMenuItemId);
  const requiredChoices = selectedMenuItem ? getRequiredChoicesForMenuItem(selectedMenuItem.slug) : [];

  const groupedMenuItems = useMemo(() => {
    const groups = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
      const cat = getCategory(item);
      acc[cat] = acc[cat] ?? [];
      acc[cat].push(item);
      return acc;
    }, {});
    return CATEGORY_ORDER.reduce<Record<string, MenuItem[]>>((ordered, cat) => {
      if (groups[cat]?.length) ordered[cat] = groups[cat];
      return ordered;
    }, {});
  }, [menuItems]);

  // When arriving at step 3 from an "Order this item →" deep-link, auto-select
  // the requested item so it's already highlighted and ready to customize.
  // Must be placed after menuItems is declared.
  useEffect(() => {
    if (step !== 3 || !initialItemSlug || itemSlugAutoSelected.current) return;
    const match = menuItems.find((item) => item.slug === initialItemSlug);
    if (!match) return;
    itemSlugAutoSelected.current = true;
    setSelectedMenuItemId(match.id);
    setSelectedChoice("");
    setSelectedAdditions([]);
    setSelectedRemovals([]);
  }, [step, initialItemSlug, menuItems]);

  const selectedItemTotalCents = useMemo(() => {
    if (!selectedMenuItem) return 0;
    const extra = selectedMenuItem.options
      .filter((o) => o.optionType === "ADD_ON" && selectedAdditions.includes(o.name))
      .reduce((sum, o) => sum + o.priceDeltaCents, 0);
    return selectedMenuItem.basePriceCents + extra;
  }, [selectedAdditions, selectedMenuItem]);

  const totalCents = useMemo(() => cartItems.reduce((s, i) => s + i.lineTotalCents, 0), [cartItems]);

  useEffect(() => {
    if (!selectedParentChildId) return;
    const child = savedChildren.find((c) => c.id === selectedParentChildId);
    if (!child) return;
    setSelectedSchoolId(child.schoolId);
    setSelectedDeliveryDateId((cur) => {
      const match = deliveryDates.find((d) => d.id === cur && d.schoolId === child.schoolId);
      return match?.id ?? deliveryDates.find((d) => d.schoolId === child.schoolId)?.id ?? cur;
    });
    setStudentName(child.studentName);
    setGrade(child.grade);
    setAllergyNotes(child.allergyNotes);
  }, [deliveryDates, savedChildren, selectedParentChildId]);

  function toggle(value: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(value) ? current.filter((i) => i !== value) : [...current, value]);
  }

  function addToCart() {
    if (!selectedMenuItem) { setError("Select an item first."); return; }
    if (requiredChoices.length && !selectedChoice) { setError(`Choose a required option for ${selectedMenuItem.name}.`); return; }
    setCartItems((cur) => [...cur, {
      id: crypto.randomUUID(), menuItemId: selectedMenuItem.id, itemName: selectedMenuItem.name,
      choice: selectedChoice || undefined, additions: selectedAdditions, removals: selectedRemovals,
      lineTotalCents: selectedItemTotalCents
    }]);
    setSelectedChoice(""); setSelectedAdditions([]); setSelectedRemovals([]); setSelectedMenuItemId(""); setError("");
  }

  async function handleSubmit() {
    setError("");
    if (!cartItems.length) { setError("Add at least one item to continue."); return; }
    const payload = {
      parentName, parentEmail,
      schoolId: selectedDelivery?.school.id,
      deliveryDateId: selectedDeliveryDateId,
      parentChildId: selectedParentChildId || undefined,
      studentName, grade,
      cartItems: cartItems.map((i) => ({ menuItemId: i.menuItemId, choice: i.choice, additions: i.additions, removals: i.removals })),
      allergyNotes, dietaryNotes: null, specialInstructions: null,
    };
    const response = await fetch("/api/checkout/create-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Unable to start checkout."); return; }
    window.location.href = data.checkoutUrl;
  }

  const progressSteps = ["Date", "Student", "Menu", "Review"];

  return (
    <div className="pb-32">
      {/* Progress */}
      <div className="flex items-center gap-1 mb-4">
        {progressSteps.map((label, i) => (
          <div key={label} className="flex items-center gap-1 flex-1">
            <div className={cn("flex-1 h-1 rounded-full transition-colors", i < step ? "bg-brand-700" : "bg-slate-100")} />
            {i === progressSteps.length - 1 && (
              <div className={cn("flex-1 h-1 rounded-full", step === 4 ? "bg-brand-700" : "bg-slate-100")} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mb-4">
        {progressSteps.map((label, i) => (
          <span key={label} className={cn("text-[10px] font-medium", i + 1 === step ? "text-brand-700" : "text-slate-400")}>
            {label}
          </span>
        ))}
      </div>

      {/* STEP 1: School + Date */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Campus</p>
            {schools.map((school) => (
              <button
                key={school.id}
                type="button"
                onClick={() => { setSelectedSchoolId(school.id); setSelectedDeliveryDateId(deliveryDates.find((d) => d.school.id === school.id)?.id ?? ""); setCartItems([]); setSelectedMenuItemId(""); }}
                className={cn("w-full rounded-[14px] border p-3.5 text-left mb-2 transition", selectedSchoolId === school.id ? "border-brand-600 bg-brand-50 border-2" : "border-slate-100 bg-white")}
              >
                <p className={cn("text-[13px] font-semibold", selectedSchoolId === school.id ? "text-brand-900" : "text-ink")}>{school.name}</p>
                <p className={cn("text-[11px] mt-0.5", selectedSchoolId === school.id ? "text-brand-700" : "text-slate-500")}>Pacific Time</p>
              </button>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Delivery date</p>
            {!selectedSchoolId && (
              <p className="text-[12px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">Choose a campus above to see available dates.</p>
            )}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {schoolDeliveryDates.map((date) => {
                const sel = selectedDeliveryDateId === date.id;
                return (
                  <button
                    key={date.id}
                    type="button"
                    onClick={() => { setSelectedDeliveryDateId(date.id); setCartItems([]); setSelectedMenuItemId(""); }}
                    className={cn("flex-shrink-0 rounded-[12px] border p-3 text-center min-w-[60px] transition", sel ? "border-brand-600 bg-brand-50 border-2" : "border-slate-100 bg-white")}
                  >
                    <p className={cn("text-[9px] uppercase tracking-wide mb-0.5", sel ? "text-brand-700" : "text-slate-400")}>
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "EEE")}
                    </p>
                    <p className={cn("text-[18px] font-semibold leading-none", sel ? "text-brand-900" : "text-ink")}>
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "d")}
                    </p>
                    <p className={cn("text-[9px] mt-0.5", sel ? "text-brand-700" : "text-slate-400")}>
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "MMM")}
                    </p>
                    <p className="text-[8px] text-slate-400 mt-1 leading-tight">
                      by {formatInTimeZone(date.cutoffAt, date.school.timezone, "h:mm a")}
                    </p>
                  </button>
                );
              })}
            </div>
            {selectedDelivery && (
              <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
                ⚠ Order by <strong>{formatInTimeZone(selectedDelivery.cutoffAt, selectedDelivery.school.timezone, "MMM d h:mm a zzz")}</strong>
              </div>
            )}
          </div>
          <button type="button" onClick={() => { if (!selectedSchoolId) { setError("Choose a campus."); return; } if (!selectedDeliveryDateId) { setError("Choose a delivery date."); return; } setError(""); window.history.pushState({ orderStep: 2 }, ""); setStep(2); }}
            className="w-full py-3 rounded-xl bg-ink text-white text-[13px] font-semibold">
            Continue →
          </button>
          {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>
      )}

      {/* STEP 2: Student */}
      {step === 2 && (
        <div className="space-y-4">
          <button type="button" onClick={() => window.history.back()} className="text-[12px] text-slate-500 flex items-center gap-1 mb-2">← Back</button>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2">Ordering for</p>
            {savedChildren.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {savedChildren.filter((c) => c.schoolId === selectedSchoolId).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedParentChildId(child.id)}
                    className={cn("px-3 py-1.5 rounded-full text-[12px] font-medium border transition", selectedParentChildId === child.id ? "bg-ink text-white border-ink" : "bg-white text-slate-600 border-slate-200")}
                  >
                    {child.studentName}, Gr {child.grade}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedParentChildId("")}
                  className={cn("px-3 py-1.5 rounded-full text-[12px] font-medium border transition", !selectedParentChildId ? "bg-ink text-white border-ink" : "bg-white text-slate-500 border-dashed border-slate-200")}
                >
                  + Manual entry
                </button>
              </div>
            )}
          </div>
          <div className="rounded-[18px] border border-slate-100 bg-white p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Parent name</label>
                <input className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2" value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Your name" required />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Parent email</label>
                <input type="email" className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="email@example.com" required />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Student name</label>
                <input className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Student name" required />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Grade</label>
                <select className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2" value={grade} onChange={(e) => setGrade(e.target.value)} required>
                  <option value="" disabled>Select grade</option>
                  {gradeOptions.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Allergy notes</label>
              <textarea className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2 resize-none" rows={2} value={allergyNotes} onChange={(e) => setAllergyNotes(e.target.value)} placeholder="e.g. nut allergy, no dairy..." />
            </div>
          </div>
          <button type="button" onClick={() => { if (!studentName || !grade || !parentName || !parentEmail) { setError("Fill in all required fields."); return; } setError(""); window.history.pushState({ orderStep: 3 }, ""); setStep(3); }}
            className="w-full py-3 rounded-xl bg-ink text-white text-[13px] font-semibold">
            Choose meals →
          </button>
          {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>
      )}

      {/* STEP 3: Menu */}
      {step === 3 && (
        <div ref={menuScrollRef}>
          <button type="button" onClick={() => window.history.back()} className="text-[12px] text-slate-500 flex items-center gap-1 mb-3">← Back</button>
          <div className="rounded-[14px] bg-green-50 border border-green-100 px-3 py-2.5 mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-green-800">☪ Hand Slaughtered Halal</span>
            <span className="text-green-200 text-[11px]">|</span>
            <span className="text-[11px] font-semibold text-green-800">HFSAA Certified</span>
            <span className="text-green-200 text-[11px]">|</span>
            <span className="text-[11px] text-green-700">⚠ Contains Dairy</span>
          </div>
          <div className="rounded-[14px] bg-brand-50 border border-brand-100 px-3 py-2.5 mb-4 text-[12px] text-brand-900 flex justify-between items-center">
            <span>{studentName} &middot; {formatInTimeZone(selectedDelivery!.deliveryDate, selectedDelivery!.school.timezone, "EEE MMM d")}</span>
            <span className="font-semibold">{selectedDelivery?.school.name}</span>
          </div>

          {Object.entries(groupedMenuItems).map(([category, items]) => (
            <div key={category} className="mb-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2 flex items-center gap-1.5">
                <span>{CATEGORY_ICONS[category]}</span>{category}
              </p>
              <div className="space-y-2">
                {items.map((item) => {
                  const isSelected = selectedMenuItemId === item.id;
                  const inCart = cartItems.some((c) => c.menuItemId === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setSelectedMenuItemId(item.id); setSelectedChoice(""); setSelectedAdditions([]); setSelectedRemovals([]); setError(""); }}
                      className={cn(
                        "w-full rounded-[14px] border p-3 text-left flex gap-2.5 items-start transition",
                        isSelected ? "border-brand-600 bg-brand-50 border-2" : inCart ? "border-green-200 bg-green-50/40 border" : "border-slate-100 bg-white"
                      )}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-slate-100"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                          {CATEGORY_ICONS[category] || "🍽"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-[13px] font-semibold leading-snug", isSelected ? "text-brand-900" : "text-ink")}>
                            {item.name}
                            {getRequiredChoicesForMenuItem(item.slug).length > 0 && (
                              <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">choose style</span>
                            )}
                          </p>
                          <span className={cn("text-[13px] font-semibold flex-shrink-0", isSelected ? "text-brand-700" : "text-ink")}>
                            {fmt(item.basePriceCents)}
                          </span>
                        </div>
                        {getDesc(item) && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{getDesc(item)}</p>}
                        {inCart && <p className="text-[10px] text-green-700 font-medium mt-1">✓ In cart</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Customize panel */}
          {selectedMenuItem && (
            <div ref={customizePanelRef} className="rounded-[18px] border-2 border-brand-200 bg-brand-50 p-4 mb-4 space-y-3">
              <p className="text-[13px] font-semibold text-brand-900">Customize: {selectedMenuItem.name}</p>

              {requiredChoices.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-ink mb-2">Required — choose one</p>
                  <div className="space-y-1.5">
                    {requiredChoices.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setSelectedChoice(choice)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[12px] text-left transition",
                          selectedChoice === choice ? "border-brand-600 bg-white text-brand-900 font-semibold" : "border-slate-100 bg-white text-slate-700")}
                      >
                        <div className={cn("w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                          selectedChoice === choice ? "border-brand-600 bg-brand-600" : "border-slate-300")}>
                          {selectedChoice === choice && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-ink mb-2">Add-ons</p>
                  <div className="space-y-1.5">
                    {selectedMenuItem.options.filter((o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name)).map((option) => (
                      <button key={option.id} type="button" onClick={() => toggle(option.name, selectedAdditions, setSelectedAdditions)}
                        className={cn("w-full px-2.5 py-1.5 rounded-full text-[11px] border text-left transition",
                          selectedAdditions.includes(option.name) ? "bg-brand-100 border-brand-300 text-brand-900 font-medium" : "bg-white border-slate-200 text-slate-600")}>
                        + {option.name}{option.priceDeltaCents ? ` +${fmt(option.priceDeltaCents)}` : ""}
                      </button>
                    ))}
                    {selectedMenuItem.options.filter((o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name)).length === 0 &&
                      <p className="text-[11px] text-slate-400">None available</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-ink mb-2">Remove</p>
                  <div className="space-y-1.5">
                    {selectedMenuItem.options.filter((o) => o.optionType === "REMOVAL").map((option) => (
                      <button key={option.id} type="button" onClick={() => toggle(option.name, selectedRemovals, setSelectedRemovals)}
                        className={cn("w-full px-2.5 py-1.5 rounded-full text-[11px] border text-left transition",
                          selectedRemovals.includes(option.name) ? "bg-red-100 border-red-300 text-red-900 font-medium" : "bg-white border-slate-200 text-slate-600")}>
                        No {option.name}
                      </button>
                    ))}
                    {selectedMenuItem.options.filter((o) => o.optionType === "REMOVAL").length === 0 &&
                      <p className="text-[11px] text-slate-400">None available</p>}
                  </div>
                </div>
              </div>

              {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={addToCart}
                  className="flex-1 py-2.5 rounded-xl bg-brand-700 text-white text-[13px] font-semibold">
                  Add to cart — {fmt(selectedItemTotalCents)}
                </button>
                <button type="button" onClick={() => setSelectedMenuItemId("")}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Cart */}
          {cartItems.length > 0 && (
            <div className="rounded-[18px] border border-slate-100 bg-white p-4 mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">Your cart</p>
              <div className="divide-y divide-slate-50">
                {cartItems.map((item) => (
                  <div key={item.id} className="py-2.5 flex gap-2 items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink">{item.itemName}</p>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        {[item.choice ? `${item.choice}` : "", item.additions.length ? `+ ${item.additions.join(", ")}` : "", item.removals.length ? `No: ${item.removals.join(", ")}` : ""].filter(Boolean).join(" · ") || "No customizations"}
                      </p>
                      <button type="button" onClick={() => setCartItems((cur) => cur.filter((i) => i.id !== item.id))}
                        className="text-[10px] text-red-600 mt-0.5">Remove</button>
                    </div>
                    <p className="text-[13px] font-semibold text-ink flex-shrink-0">{fmt(item.lineTotalCents)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-3 mt-1 flex justify-between">
                <span className="text-[13px] font-semibold text-ink">Total</span>
                <span className="text-[16px] font-semibold text-ink">{fmt(totalCents)}</span>
              </div>
            </div>
          )}

          <button type="button" onClick={() => { if (!cartItems.length) { setError("Add at least one item first."); return; } setError(""); window.history.pushState({ orderStep: 4 }, ""); setStep(4); }}
            disabled={!cartItems.length}
            className="w-full py-3 rounded-xl bg-ink text-white text-[13px] font-semibold disabled:opacity-30">
            Review & pay →
          </button>
          {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2 mt-2">{error}</p>}
        </div>
      )}

      {/* STEP 4: Review */}
      {step === 4 && (
        <div className="space-y-4">
          <button type="button" onClick={() => window.history.back()} className="text-[12px] text-slate-500 flex items-center gap-1 mb-2">← Back</button>

          <div className="rounded-[18px] border border-slate-100 bg-white divide-y divide-slate-50 overflow-hidden">
            <div className="p-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Delivery</p>
              <p className="text-[13px] font-semibold text-ink">{selectedDelivery && formatInTimeZone(selectedDelivery.deliveryDate, selectedDelivery.school.timezone, "EEEE, MMMM d")}</p>
              <p className="text-[12px] text-slate-500">{selectedDelivery?.school.name}</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Student</p>
              <p className="text-[13px] font-semibold text-ink">{studentName}</p>
              <p className="text-[12px] text-slate-500">Grade {grade}{allergyNotes ? ` · Allergy: ${allergyNotes}` : ""}</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Order</p>
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between mb-2">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{item.itemName}</p>
                    <p className="text-[11px] text-slate-500">{[item.choice, item.additions.length ? `+ ${item.additions.join(", ")}` : "", item.removals.length ? `No: ${item.removals.join(", ")}` : ""].filter(Boolean).join(" · ")}</p>
                  </div>
                  <p className="text-[13px] font-semibold text-ink">{fmt(item.lineTotalCents)}</p>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3 mt-1 flex justify-between">
                <span className="text-[13px] font-semibold">Order total</span>
                <span className="text-[18px] font-semibold text-ink">{fmt(totalCents)}</span>
              </div>
            </div>
            <div className="p-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Contact</p>
              <p className="text-[13px] font-semibold text-ink">{parentName}</p>
              <p className="text-[12px] text-slate-500">{parentEmail}</p>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 flex gap-2">
            <span>🔒</span>
            <span>You'll be redirected to <strong>Stripe</strong> for secure payment. Confirmation sent by email.</span>
          </div>

          {error && <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <button type="button" onClick={handleSubmit}
            className="w-full py-3.5 rounded-xl bg-brand-700 text-white text-[14px] font-semibold">
            Pay with Stripe →
          </button>
        </div>
      )}
    </div>
  );
}
