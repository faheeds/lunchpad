"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { getWeekdayNumber } from "@/lib/weekly-week";
import { cn } from "@/lib/utils";

type ChildSummary = {
  id: string;
  schoolId: string;
  schoolName: string;
  timezone: string;
  studentName: string;
  grade: string;
};

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
  options: MenuOption[];
};

type DeliveryDate = {
  id: string;
  schoolId: string;
  deliveryDate: string;
  cutoffAt: string;
  school: { id: string; name: string; timezone: string };
  menuItems: MenuItem[];
};

type WeeklyPlanSummary = {
  id: string;
  parentChildId: string;
  weekday: number;
  menuItemId: string;
  menuItemName: string;
  choice: string | null;
  additions: string[];
  removals: string[];
  isActive: boolean;
  sortOrder: number;
};

type PlannerProps = {
  children: ChildSummary[];
  deliveryDates: DeliveryDate[];
  existingPlans: WeeklyPlanSummary[];
};

const WEEKDAY_LABELS: Record<number, { short: string; long: string }> = {
  1: { short: "Mon", long: "Monday" },
  2: { short: "Tue", long: "Tuesday" },
  3: { short: "Wed", long: "Wednesday" },
  4: { short: "Thu", long: "Thursday" }
  // Friday removed — school provides lunch Mon–Thu only
};

const CATEGORY_ORDER = [
  "Signature Burgers & Sandwiches",
  "Salads with Protein",
  "Comfort Favorites",
  "Sides & Snacks"
];

const CATEGORY_ICONS: Record<string, string> = {
  "Signature Burgers & Sandwiches": "🍔",
  "Salads with Protein": "🥗",
  "Comfort Favorites": "🍗",
  "Sides & Snacks": "🍟"
};

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function getCategory(item: MenuItem) {
  const prefix = item.description?.split(".")[0]?.trim();
  if (prefix && CATEGORY_ORDER.includes(prefix)) return prefix;
  if (item.name.includes("Burger") || item.name.includes("Sandwich")) return "Signature Burgers & Sandwiches";
  if (item.name.includes("Salad")) return "Salads with Protein";
  if (
    item.name.includes("Mac") ||
    item.name.includes("Quesadilla") ||
    item.name.includes("Wings") ||
    item.name.includes("Tender")
  )
    return "Comfort Favorites";
  return "Sides & Snacks";
}

function getDesc(item: MenuItem) {
  const parts = item.description?.split(". ");
  if (!parts?.length) return "";
  if (CATEGORY_ORDER.includes(parts[0].trim())) return parts.slice(1).join(". ").trim();
  return item.description ?? "";
}

export function WeeklyPlanPlanner({ children, deliveryDates, existingPlans }: PlannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id ?? "");
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [selectedAdditions, setSelectedAdditions] = useState<string[]>([]);
  const [selectedRemovals, setSelectedRemovals] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showAdder, setShowAdder] = useState(false);
  const customizePanelRef = useRef<HTMLDivElement>(null);

  // Scroll to the customize panel whenever a menu item is selected
  useEffect(() => {
    if (selectedMenuItemId) {
      setTimeout(() => {
        customizePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [selectedMenuItemId]);

  const selectedChild = children.find((c) => c.id === selectedChildId);

  // Build list of upcoming weekdays for the selected child.
  // One entry per weekday (1-5): keep the earliest orderable delivery date so we
  // don't show two Wednesdays when the ordering window spans two calendar weeks —
  // the weekly-checkout flow matches each plan to the earliest delivery date for
  // that weekday, so we mirror that here. Sorted chronologically by actual date.
  const availableDaysForChild = useMemo(() => {
    if (!selectedChild) return [] as { weekday: number; deliveryDate: DeliveryDate }[];
    const datesForSchool = deliveryDates
      .filter((d) => d.schoolId === selectedChild.schoolId)
      .map((date) => ({
        weekday: getWeekdayNumber(new Date(date.deliveryDate), date.school.timezone),
        deliveryDate: date
      }))
      .filter((entry) => entry.weekday >= 1 && entry.weekday <= 4) // Mon–Thu only
      .sort(
        (a, b) =>
          new Date(a.deliveryDate.deliveryDate).getTime() - new Date(b.deliveryDate.deliveryDate).getTime()
      );

    const byWeekday = new Map<number, { weekday: number; deliveryDate: DeliveryDate }>();
    for (const entry of datesForSchool) {
      if (!byWeekday.has(entry.weekday)) byWeekday.set(entry.weekday, entry);
    }
    return Array.from(byWeekday.values()).sort(
      (a, b) =>
        new Date(a.deliveryDate.deliveryDate).getTime() - new Date(b.deliveryDate.deliveryDate).getTime()
    );
  }, [deliveryDates, selectedChild]);

  const activeDay = availableDaysForChild.find((d) => d.weekday === selectedWeekday) ?? null;
  const dayMenuItems = activeDay?.deliveryDate.menuItems ?? [];

  const groupedMenuItems = useMemo(() => {
    const groups = dayMenuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
      const cat = getCategory(item);
      acc[cat] = acc[cat] ?? [];
      acc[cat].push(item);
      return acc;
    }, {});
    return CATEGORY_ORDER.reduce<Record<string, MenuItem[]>>((ordered, cat) => {
      if (groups[cat]?.length) ordered[cat] = groups[cat];
      return ordered;
    }, {});
  }, [dayMenuItems]);

  const selectedMenuItem = dayMenuItems.find((item) => item.id === selectedMenuItemId);
  const requiredChoices = selectedMenuItem ? getRequiredChoicesForMenuItem(selectedMenuItem.slug) : [];

  const selectedItemTotalCents = useMemo(() => {
    if (!selectedMenuItem) return 0;
    const extra = selectedMenuItem.options
      .filter((o) => o.optionType === "ADD_ON" && selectedAdditions.includes(o.name))
      .reduce((sum, o) => sum + o.priceDeltaCents, 0);
    return selectedMenuItem.basePriceCents + extra;
  }, [selectedAdditions, selectedMenuItem]);

  const plansByWeekday = useMemo(() => {
    const filtered = existingPlans.filter((p) => p.parentChildId === selectedChildId);
    return filtered.reduce<Record<number, WeeklyPlanSummary[]>>((acc, plan) => {
      acc[plan.weekday] = acc[plan.weekday] ?? [];
      acc[plan.weekday].push(plan);
      return acc;
    }, {});
  }, [existingPlans, selectedChildId]);

  function toggle(value: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(value) ? current.filter((i) => i !== value) : [...current, value]);
  }

  function resetAdderState() {
    setSelectedMenuItemId("");
    setSelectedChoice("");
    setSelectedAdditions([]);
    setSelectedRemovals([]);
    setError("");
  }

  function handleSelectChild(childId: string) {
    setSelectedChildId(childId);
    setSelectedWeekday(null);
    setShowAdder(false);
    resetAdderState();
  }

  function handleSelectWeekday(weekday: number) {
    setSelectedWeekday(weekday);
    setShowAdder(false);
    resetAdderState();
  }

  async function runMutation(
    input: { method: "POST" | "PATCH" | "DELETE"; body: Record<string, unknown> },
    onSuccess?: () => void
  ) {
    setError("");
    const response = await fetch("/api/account/weekly-plans", {
      method: input.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Unable to save changes.");
      return;
    }
    onSuccess?.();
    startTransition(() => router.refresh());
  }

  function handleAdd() {
    if (!selectedChild) {
      setError("Choose a child first.");
      return;
    }
    if (!selectedWeekday) {
      setError("Pick a day.");
      return;
    }
    if (!selectedMenuItem) {
      setError("Pick a menu item.");
      return;
    }
    if (requiredChoices.length && !selectedChoice) {
      setError(`Choose a required option for ${selectedMenuItem.name}.`);
      return;
    }
    void runMutation(
      {
        method: "POST",
        body: {
          parentChildId: selectedChild.id,
          weekday: selectedWeekday,
          menuItemId: selectedMenuItem.id,
          choice: selectedChoice || null,
          additions: selectedAdditions,
          removals: selectedRemovals
        }
      },
      () => {
        resetAdderState();
        setShowAdder(false);
      }
    );
  }

  if (!children.length) {
    return (
      <p className="text-[12px] text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
        Add a saved child first to build a weekly lunch plan.
      </p>
    );
  }

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4">
      {/* Child selector */}
      <div>
        <p className="text-[11px] font-semibold text-ink mb-2">1. Pick a child</p>
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => handleSelectChild(child.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-medium border transition",
                child.id === selectedChildId
                  ? "bg-ink text-white border-ink"
                  : "bg-white text-slate-600 border-slate-200"
              )}
            >
              {child.studentName}, Gr {child.grade}
            </button>
          ))}
        </div>
      </div>

      {selectedChild && availableDaysForChild.length === 0 && (
        <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
          No delivery dates are open for {selectedChild.schoolName} in the upcoming lunch week. Check back soon.
        </div>
      )}

      {selectedChild && availableDaysForChild.length > 0 && (
        <>
          {/* Weekday tabs — only for days with a scheduled, still-open delivery date */}
          <div>
            <p className="text-[11px] font-semibold text-ink mb-2">
              2. Build {selectedChild.studentName}&apos;s week
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {availableDaysForChild.map(({ weekday, deliveryDate }) => {
                const tz = deliveryDate.school.timezone;
                const count = plansByWeekday[weekday]?.length ?? 0;
                const active = selectedWeekday === weekday;
                return (
                  <button
                    key={deliveryDate.id}
                    type="button"
                    onClick={() => handleSelectWeekday(weekday)}
                    className={cn(
                      "flex-shrink-0 rounded-xl border px-3 py-2 text-center min-w-[72px] transition",
                      active ? "border-brand-600 bg-brand-50 border-2" : "border-slate-100 bg-white"
                    )}
                  >
                    <p className={cn("text-[10px] uppercase tracking-wide", active ? "text-brand-700" : "text-slate-400")}>
                      {formatInTimeZone(deliveryDate.deliveryDate, tz, "EEE")}
                    </p>
                    <p className={cn("text-[16px] font-semibold leading-none mt-0.5", active ? "text-brand-900" : "text-ink")}>
                      {formatInTimeZone(deliveryDate.deliveryDate, tz, "d")}
                    </p>
                    <p className={cn("text-[9px] mt-0.5 uppercase tracking-wide", active ? "text-brand-700" : "text-slate-400")}>
                      {formatInTimeZone(deliveryDate.deliveryDate, tz, "MMM")}
                    </p>
                    <p className={cn("text-[9px] mt-0.5", active ? "text-brand-700" : "text-slate-400")}>
                      {count ? `${count} set` : "Open"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day panel */}
          {activeDay && (
            <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    {WEEKDAY_LABELS[activeDay.weekday]?.long ?? `Day ${activeDay.weekday}`}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatInTimeZone(activeDay.deliveryDate.deliveryDate, activeDay.deliveryDate.school.timezone, "MMM d")}
                    {" · order by "}
                    {formatInTimeZone(activeDay.deliveryDate.cutoffAt, activeDay.deliveryDate.school.timezone, "MMM d h:mm a")}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400">{selectedChild.schoolName}</span>
              </div>

              {/* Existing plans */}
              {(plansByWeekday[activeDay.weekday] ?? []).length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {(plansByWeekday[activeDay.weekday] ?? []).map((plan) => (
                    <div key={plan.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-ink">{plan.menuItemName}</p>
                        {plan.choice && <p className="text-[11px] text-slate-500">{plan.choice}</p>}
                        {plan.additions.length > 0 && (
                          <p className="text-[11px] text-slate-500">+ {plan.additions.join(", ")}</p>
                        )}
                        {plan.removals.length > 0 && (
                          <p className="text-[11px] text-slate-500">No {plan.removals.join(", ")}</p>
                        )}
                        <p
                          className={cn(
                            "text-[10px] font-medium mt-1",
                            plan.isActive ? "text-brand-700" : "text-slate-400"
                          )}
                        >
                          {plan.isActive ? "Active" : "Paused"}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void runMutation({
                              method: "PATCH",
                              body: { planId: plan.id, isActive: !plan.isActive }
                            })
                          }
                          className="px-2.5 py-1 rounded-full border border-slate-200 text-[11px] text-slate-600"
                        >
                          {plan.isActive ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runMutation({ method: "DELETE", body: { planId: plan.id } })}
                          className="px-2.5 py-1 rounded-full border border-red-200 text-[11px] text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-[12px] text-slate-400">Nothing saved for this day yet.</p>
              )}

              {/* Adder */}
              {!showAdder ? (
                <div className="px-4 py-3 border-t border-slate-50">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdder(true);
                      resetAdderState();
                    }}
                    className="w-full py-2.5 rounded-xl border-2 border-dashed border-brand-300 text-brand-700 text-[13px] font-semibold hover:bg-brand-50 transition"
                  >
                    + Add a meal for {WEEKDAY_LABELS[activeDay.weekday]?.long ?? "this day"}
                  </button>
                </div>
              ) : (
                <div className="px-4 py-4 border-t border-slate-50 bg-slate-50/50 space-y-4">
                  {dayMenuItems.length === 0 ? (
                    <p className="text-[12px] text-slate-500">
                      No menu items are available for this delivery date.
                    </p>
                  ) : (
                    <>
                      {/* Menu by category */}
                      {Object.entries(groupedMenuItems).map(([category, items]) => (
                        <div key={category}>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-2 flex items-center gap-1.5">
                            <span>{CATEGORY_ICONS[category]}</span>
                            {category}
                          </p>
                          <div className="space-y-2">
                            {items.map((item) => {
                              const isSelected = selectedMenuItemId === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedMenuItemId(item.id);
                                    setSelectedChoice("");
                                    setSelectedAdditions([]);
                                    setSelectedRemovals([]);
                                    setError("");
                                  }}
                                  className={cn(
                                    "w-full rounded-[14px] border p-3 text-left flex gap-2.5 items-start transition",
                                    isSelected
                                      ? "border-brand-600 bg-brand-50 border-2"
                                      : "border-slate-100 bg-white"
                                  )}
                                >
                                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                                    {CATEGORY_ICONS[category] || "🍽"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <p
                                        className={cn(
                                          "text-[13px] font-semibold leading-snug",
                                          isSelected ? "text-brand-900" : "text-ink"
                                        )}
                                      >
                                        {item.name}
                                        {getRequiredChoicesForMenuItem(item.slug).length > 0 && (
                                          <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                            choose style
                                          </span>
                                        )}
                                      </p>
                                      <span
                                        className={cn(
                                          "text-[13px] font-semibold flex-shrink-0",
                                          isSelected ? "text-brand-700" : "text-ink"
                                        )}
                                      >
                                        {fmt(item.basePriceCents)}
                                      </span>
                                    </div>
                                    {getDesc(item) && (
                                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                        {getDesc(item)}
                                      </p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Customize */}
                      {selectedMenuItem && (
                        <div ref={customizePanelRef} className="rounded-[18px] border-2 border-brand-200 bg-brand-50 p-4 space-y-3">
                          <p className="text-[13px] font-semibold text-brand-900">
                            Customize: {selectedMenuItem.name}
                          </p>

                          {requiredChoices.length > 0 && (
                            <div>
                              <p className="text-[11px] font-semibold text-ink mb-2">Required — choose one</p>
                              <div className="space-y-1.5">
                                {requiredChoices.map((choice) => (
                                  <button
                                    key={choice}
                                    type="button"
                                    onClick={() => setSelectedChoice(choice)}
                                    className={cn(
                                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[12px] text-left transition",
                                      selectedChoice === choice
                                        ? "border-brand-600 bg-white text-brand-900 font-semibold"
                                        : "border-slate-100 bg-white text-slate-700"
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                                        selectedChoice === choice ? "border-brand-600 bg-brand-600" : "border-slate-300"
                                      )}
                                    >
                                      {selectedChoice === choice && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                      )}
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
                                {selectedMenuItem.options
                                  .filter(
                                    (o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name)
                                  )
                                  .map((option) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => toggle(option.name, selectedAdditions, setSelectedAdditions)}
                                      className={cn(
                                        "w-full px-2.5 py-1.5 rounded-full text-[11px] border text-left transition",
                                        selectedAdditions.includes(option.name)
                                          ? "bg-brand-100 border-brand-300 text-brand-900 font-medium"
                                          : "bg-white border-slate-200 text-slate-600"
                                      )}
                                    >
                                      + {option.name}
                                      {option.priceDeltaCents ? ` +${fmt(option.priceDeltaCents)}` : ""}
                                    </button>
                                  ))}
                                {selectedMenuItem.options.filter(
                                  (o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name)
                                ).length === 0 && (
                                  <p className="text-[11px] text-slate-400">None available</p>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-[11px] font-semibold text-ink mb-2">Remove</p>
                              <div className="space-y-1.5">
                                {selectedMenuItem.options
                                  .filter((o) => o.optionType === "REMOVAL")
                                  .map((option) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => toggle(option.name, selectedRemovals, setSelectedRemovals)}
                                      className={cn(
                                        "w-full px-2.5 py-1.5 rounded-full text-[11px] border text-left transition",
                                        selectedRemovals.includes(option.name)
                                          ? "bg-red-50 border-red-200 text-red-700 font-medium"
                                          : "bg-white border-slate-200 text-slate-600"
                                      )}
                                    >
                                      − {option.name}
                                    </button>
                                  ))}
                                {selectedMenuItem.options.filter((o) => o.optionType === "REMOVAL").length === 0 && (
                                  <p className="text-[11px] text-slate-400">None available</p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="pt-1 text-[11px] text-brand-900 font-medium">
                            Subtotal: {fmt(selectedItemTotalCents)}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAdder(false);
                            resetAdderState();
                          }}
                          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[13px] font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAdd}
                          disabled={isPending || !selectedMenuItem}
                          className="flex-1 py-2.5 rounded-xl bg-brand-700 text-white text-[13px] font-semibold disabled:opacity-50"
                        >
                          Save to {WEEKDAY_LABELS[activeDay.weekday]?.short ?? "day"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}
    </div>
  );
}
