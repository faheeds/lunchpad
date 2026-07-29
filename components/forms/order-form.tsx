"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { differenceInDays, differenceInHours, differenceInMinutes } from "date-fns";
import type { LocationType } from "@prisma/client";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { resolveLineItemPrice } from "@/lib/pricing";
import { getGradesForSchoolName } from "@/lib/grades";
import { getLabels } from "@/lib/location-labels";
import { cn } from "@/lib/utils";
import { getLabelsForOperator } from "@/lib/location-labels";

type DeliveryDate = {
  id: string; schoolId: string; deliveryDate: string; cutoffAt: string; orderingOpen: boolean;
  school: { id: string; name: string; timezone: string; locationType: LocationType };
};

// Threshold above which the location selector switches from tile UI to a
// grouped dropdown. Tiles are friendlier for tap targets, but past 4 they
// wrap awkwardly on phones and a single dropdown scrolls cleaner.
const LOCATION_DROPDOWN_THRESHOLD = 4;
type MenuOption = { id: string; name: string; optionType: "ADD_ON" | "REMOVAL"; priceDeltaCents: number };
type MenuItemSize = {
  id: string;
  name: string;
  priceCents: number;
};

type MenuItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  /** Operator-set category from MenuItem.category. Optional for back-compat
   *  with older callers; getCategory() falls back to a sensible default
   *  when missing. */
  category?: string | null;
  /** Operator-set required choices (e.g. Beef / Crispy Chicken / Vegan for
   *  a "Build Your Own Burger"). Optional for back-compat — when empty
   *  the helper falls back to a hardcoded legacy slug map. */
  requiredChoices?: string[];
  /** Operator-set size variants (e.g. Small / Medium / Large). When
   *  non-empty, the customer MUST pick a size and the size's priceCents
   *  becomes the line's base price. Items without sizes use basePriceCents. */
  sizes?: MenuItemSize[];
  options: MenuOption[];
};
type CartItem = {
  id: string;
  menuItemId: string;
  itemName: string;
  choice?: string;
  /** Selected size's display name (e.g. "Medium"). Only set when the
   *  menu item declared sizes. Different sizes of the same item are
   *  always separate cart lines (see buildLineKey). */
  size?: string;
  additions: string[];
  removals: string[];
  /** Per-unit total (base + additions). For sized items the base is
   *  the size's priceCents, not the menu item's basePriceCents.
   *  Multiply by `quantity` for the line total. */
  lineTotalCents: number;
  /** Number of identical units of this configuration. Always ≥ 1. */
  quantity: number;
};

/** Two cart lines share an identity when they refer to the same menu
 *  item with the same size/choice/additions/removals — adding an item
 *  with matching customizations bumps the quantity instead of duplicating. */
function buildLineKey(
  menuItemId: string,
  size: string | undefined,
  choice: string | undefined,
  additions: string[],
  removals: string[],
): string {
  const a = [...additions].sort().join("|");
  const r = [...removals].sort().join("|");
  return `${menuItemId}::${size ?? ""}::${choice ?? ""}::${a}::${r}`;
}

type OrderFormProps = {
  deliveryDates: DeliveryDate[];
  menuItemsByDeliveryDate: Record<string, MenuItem[]>;
  savedChildren?: { id: string; schoolId: string; studentName: string; grade: string; allergyNotes: string }[];
  initialParentProfile?: { parentName: string; parentEmail: string; parentChildId: string; studentName: string; grade: string; allergyNotes: string };
  initialSchoolId?: string;
  initialDeliveryDateId?: string;
  initialCartItems?: CartItem[];
  initialItemSlug?: string;
  /** Items from a reorder that aren't on the current date's menu — shown as a warning banner */
  unavailableReorderItems?: string[];
  /** Items from a reorder that are on the menu but need a manual choice/size before adding */
  needsSelectionItems?: string[];
  /** Per delivery date ID: list of menuItemIds that have sold out */
  soldOutByDeliveryDate?: Record<string, string[]>;
  /** Restaurant.operatorType — "school" | "office" | "hybrid" | null.
   *  Drives whether user-facing copy says "Student" / "Grade" / "Parent" or
   *  the office-appropriate equivalents. Defaults to school for legacy
   *  restaurants whose operatorType isn't set yet. */
  operatorType?: string | null;
};

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Category resolution now reads from MenuItem.category (operator-set via
// admin Menu page). Items without a category land in "Other" so they
// still render. Previously hardcoded to FS's Kitchen's four buckets;
// that no longer makes sense for the multi-tenant platform.
function getCategory(item: MenuItem): string {
  return item.category?.trim() || "Other";
}

function getDesc(item: MenuItem): string {
  return item.description ?? "";
}

// Pick a sensible emoji for whichever category an operator named. Same
// keyword-match heuristic as the marketing /menu page so the visual
// vocabulary stays consistent between browse and order flows.
function getCategoryIcon(category: string): string {
  const c = category.toLowerCase();
  if (c.match(/burger|sandwich|wrap|sub/)) return "🍔";
  if (c.match(/salad|veg|green|bowl/)) return "🥗";
  if (c.match(/pizza|pasta|italian/)) return "🍕";
  if (c.match(/chicken|wings|tender|nugget/)) return "🍗";
  if (c.match(/taco|burrito|mexican|quesadilla/)) return "🌮";
  if (c.match(/asian|noodle|rice|sushi/)) return "🍜";
  if (c.match(/breakfast|pancake|waffle|egg/)) return "🥞";
  if (c.match(/drink|beverage|juice|smoothie|milk|tea|coffee/)) return "🥤";
  if (c.match(/dessert|cookie|cake|ice cream|sweet/)) return "🍰";
  if (c.match(/side|snack|fries|chips/)) return "🍟";
  if (c.match(/comfort|favorite/)) return "🍗";
  return "🍽";
}

// Steps: 1=date, 2=menu & cart, 3=recipient & contact, 4=review & pay
type Step = 1 | 2 | 3 | 4;
type Toast = { id: string; message: string; type: "success" | "error" };
function getTimeToDeadline(cutoffAt: string, timezone: string): { days: number; hours: number; minutes: number; display: string } {
  const now = new Date();
  const cutoff = new Date(cutoffAt);
  const days = differenceInDays(cutoff, now);
  const hours = differenceInHours(cutoff, now) - days * 24;
  const minutes = differenceInMinutes(cutoff, now) - days * 24 * 60 - hours * 60;
  let display = "";
  if (days > 0) display = `${days} day${days > 1 ? "s" : ""} left`;
  else if (hours > 0) display = `${hours}h ${minutes}m left`;
  else display = `${minutes}m left`;
  return { days, hours, minutes, display };
}

export function OrderForm({
  deliveryDates, menuItemsByDeliveryDate, savedChildren = [], operatorType,
  initialParentProfile, initialSchoolId, initialDeliveryDateId, initialCartItems = [],
  initialItemSlug, unavailableReorderItems = [], needsSelectionItems = [], soldOutByDeliveryDate = {},
}: OrderFormProps) {
  const defaultSchoolId = initialSchoolId || "";
  const defaultDeliveryDateId = initialDeliveryDateId || "";

  const [step, setStep] = useState<Step>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState(defaultSchoolId);
  const [selectedDeliveryDateId, setSelectedDeliveryDateId] = useState(defaultDeliveryDateId);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  /** Currently-picked size for the selected menu item. Empty string =
   *  no selection yet (auto-set to the first available size when an item
   *  with sizes is opened in the customize panel). */
  const [selectedSize, setSelectedSize] = useState("");
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
  // For OFFICE locations the orderer is usually the recipient — default the
  // "ordering for myself" toggle on. Reset to true whenever the user picks
  // an office (covers switching from a school location mid-flow).
  const [orderForSelf, setOrderForSelf] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const customizePanelRef = useRef<HTMLDivElement>(null);
  const itemSlugAutoSelected = useRef(false);

  function addToast(message: string, type: "success" | "error" = "success") {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

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

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
  const selectedSchoolName = selectedSchool?.name ?? "";
  // Labels track the *currently selected* location's type. Before any
  // selection we default to school labels (the more common case) but the
  // form re-renders the moment the user picks a location.
  // Labels resolution: once the customer picks a location, switch to that
  // location's specific labels (per-location school-vs-office). Before any
  // selection — including the very first stepper render — fall back to the
  // restaurant-wide operator labels so an office-only tenant doesn't briefly
  // see "Student" copy in the stepper title.
  const labels = selectedSchool
    ? getLabels(selectedSchool.locationType)
    : getLabelsForOperator(operatorType);
  const isOffice = selectedSchool?.locationType === "OFFICE";
  const gradeOptions = getGradesForSchoolName(selectedSchoolName);

  // Group locations by type for the dropdown — when the tenant has both
  // schools and offices we render two <optgroup>s so the selector doesn't
  // mix them visually.
  const groupedSchools = useMemo(() => {
    const schoolList = schools.filter((s) => s.locationType === "SCHOOL");
    const officeList = schools.filter((s) => s.locationType === "OFFICE");
    return { school: schoolList, office: officeList };
  }, [schools]);
  const useDropdown = schools.length > LOCATION_DROPDOWN_THRESHOLD;

  const schoolDeliveryDates = useMemo(() => deliveryDates.filter((d) => d.school.id === selectedSchoolId), [deliveryDates, selectedSchoolId]);
  const selectedDelivery = deliveryDates.find((d) => d.id === selectedDeliveryDateId);
  const menuItems = menuItemsByDeliveryDate[selectedDeliveryDateId] ?? [];
  const soldOutIds = useMemo(
    () => new Set(soldOutByDeliveryDate[selectedDeliveryDateId] ?? []),
    [soldOutByDeliveryDate, selectedDeliveryDateId]
  );
  const selectedMenuItem = menuItems.find((item) => item.id === selectedMenuItemId);
  const requiredChoices = selectedMenuItem ? getRequiredChoicesForMenuItem(selectedMenuItem) : [];

  // Group items by their MenuItem.category. Order of categories is
  // first-seen — since menu items arrive sorted by sortOrder (admin can
  // drag-reorder) the categories surface in the operator's intended
  // sequence. "Other" bucket catches items with no category set.
  const groupedMenuItems = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {};
    for (const item of menuItems) {
      const cat = getCategory(item);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
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
    setSelectedSize("");
    setSelectedAdditions([]);
    setSelectedRemovals([]);
  }, [step, initialItemSlug, menuItems]);

  // Auto-pick the first size when a sized item is opened in the customize
  // panel so the Add-to-cart button isn't disabled by default. The
  // operator-set sortOrder is preserved, so the first size is whatever
  // they wanted as the default.
  useEffect(() => {
    if (!selectedMenuItem) return;
    const sizes = selectedMenuItem.sizes ?? [];
    if (sizes.length > 0 && !selectedSize) {
      setSelectedSize(sizes[0].name);
    }
  }, [selectedMenuItem, selectedSize]);

  const selectedItemTotalCents = useMemo(() => {
    if (!selectedMenuItem) return 0;
    // Sized items: line base = picked size's price (falls back to first
    // size if state hasn't caught up). Non-sized: legacy basePriceCents.
    const sizes = selectedMenuItem.sizes ?? [];
    const sizeMatch = sizes.length > 0 ? (sizes.find((s) => s.name === selectedSize) ?? sizes[0]) : null;
    return resolveLineItemPrice({
      basePriceCents: selectedMenuItem.basePriceCents,
      size: sizeMatch,
      additions: selectedMenuItem.options.filter(
        (o) => o.optionType === "ADD_ON" && selectedAdditions.includes(o.name)
      ),
    });
  }, [selectedAdditions, selectedMenuItem, selectedSize]);

  const totalCents = useMemo(() => cartItems.reduce((s, i) => s + i.lineTotalCents * i.quantity, 0), [cartItems]);
  const totalUnits = useMemo(() => cartItems.reduce((s, i) => s + i.quantity, 0), [cartItems]);

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

  // Default "ordering for myself" on whenever an OFFICE location becomes
  // active and there's no saved profile in play. The user can still untick
  // it to order for a coworker.
  useEffect(() => {
    if (isOffice && !selectedParentChildId) setOrderForSelf(true);
    if (!isOffice) setOrderForSelf(false);
  }, [isOffice, selectedParentChildId]);

  // Mirror parentName into studentName whenever "ordering for myself" is on.
  useEffect(() => {
    if (orderForSelf && parentName) setStudentName(parentName);
  }, [orderForSelf, parentName]);

  function toggle(value: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(value) ? current.filter((i) => i !== value) : [...current, value]);
  }

  function addToCart() {
    if (!selectedMenuItem) { setError("Select an item first."); return; }
    if (requiredChoices.length && !selectedChoice) { setError(`Choose a required option for ${selectedMenuItem.name}.`); return; }
    const hasSizes = (selectedMenuItem.sizes ?? []).length > 0;
    if (hasSizes && !selectedSize) { setError(`Choose a size for ${selectedMenuItem.name}.`); return; }
    const choice = selectedChoice || undefined;
    const size = hasSizes ? selectedSize : undefined;
    const newKey = buildLineKey(selectedMenuItem.id, size, choice, selectedAdditions, selectedRemovals);
    setCartItems((cur) => {
      // Same item + same size + same customizations → bump qty instead of adding a duplicate row.
      const existing = cur.findIndex((i) => buildLineKey(i.menuItemId, i.size, i.choice, i.additions, i.removals) === newKey);
      if (existing >= 0) {
        const next = [...cur];
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
        return next;
      }
      return [...cur, {
        id: crypto.randomUUID(), menuItemId: selectedMenuItem.id, itemName: selectedMenuItem.name,
        choice, size, additions: selectedAdditions, removals: selectedRemovals,
        lineTotalCents: selectedItemTotalCents, quantity: 1,
      }];
    });
    addToast(`Added ${selectedMenuItem.name} to cart`);
    setSelectedChoice(""); setSelectedSize(""); setSelectedAdditions([]); setSelectedRemovals([]); setSelectedMenuItemId(""); setError("");
  }

  function incrementCartItem(id: string) {
    setCartItems((cur) => cur.map((i) => i.id === id ? { ...i, quantity: i.quantity + 1 } : i));
  }
  function decrementCartItem(id: string) {
    setCartItems((cur) => cur.flatMap((i) => {
      if (i.id !== id) return [i];
      if (i.quantity > 1) return [{ ...i, quantity: i.quantity - 1 }];
      return []; // drop the line entirely when stepped down past 1
    }));
  }

  // ── Discount state (Step 4) ────────────────────────────────────────────
  // Auto and code are populated by GET /api/orders/preview-discount.
  // The preview is read-only; the real numbers get committed by the
  // server inside createPendingOrder at checkout time.
  const [previewAuto, setPreviewAuto] = useState<{ name: string; amountCents: number } | null>(null);
  const [previewCode, setPreviewCode] = useState<{ name: string; amountCents: number } | null>(null);
  const [codeInputOpen, setCodeInputOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeApplied, setCodeApplied] = useState(""); // the code that actually applied
  const [codeError, setCodeError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  /** Fetches the current discount preview from the server. Pass the
   *  optional code to also try a customer-typed promo. The server
   *  returns the single best auto + the code outcome; we mirror both
   *  into state so the review UI can render them. */
  async function refreshDiscountPreview(codeOverride?: string) {
    if (!selectedDelivery || cartItems.length === 0) return;
    setPreviewBusy(true);
    setCodeError(null);
    try {
      const res = await fetch("/api/orders/preview-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryDateId: selectedDeliveryDateId,
          schoolId: selectedDelivery.school.id,
          code: codeOverride ?? codeApplied ?? undefined,
          cartItems: cartItems.flatMap((i) =>
            Array.from({ length: i.quantity }, () => ({
              menuItemId: i.menuItemId,
              lineTotalCents: i.lineTotalCents,
            })),
          ),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Don't blow up the whole step on a preview failure — the
        // customer can still check out at the un-discounted price.
        setPreviewAuto(null);
        setPreviewCode(null);
        return;
      }
      setPreviewAuto(data.auto);
      setPreviewCode(data.code);
      setCodeError(data.codeError ?? null);
    } finally {
      setPreviewBusy(false);
    }
  }

  // Fetch when the customer lands on the review step. Re-fetches if the
  // cart changes while they're on Step 4 (rare, but possible if they
  // navigate back and forth).
  useEffect(() => {
    if (step === 4) {
      void refreshDiscountPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedDeliveryDateId, cartItems]);

  async function handleApplyCode() {
    const code = codeInput.trim();
    if (!code) {
      setCodeError("Enter a promo code.");
      return;
    }
    setCodeApplied(code);
    await refreshDiscountPreview(code);
  }
  function handleRemoveCode() {
    setCodeInput("");
    setCodeApplied("");
    setCodeError(null);
    setPreviewCode(null);
    void refreshDiscountPreview(""); // clear-code preview
  }

  const totalDiscountCents = (previewAuto?.amountCents ?? 0) + (previewCode?.amountCents ?? 0);
  const finalTotalCents = Math.max(0, totalCents - totalDiscountCents);

  async function handleSubmit() {
    setError("");
    if (!cartItems.length) { setError("Add at least one item to continue."); return; }
    // For office self-orders, the recipient name mirrors the orderer's name.
    // For school orders, grade is required and gets sent through; for office
    // orders, grade is omitted and the server fills "—" so the non-null DB
    // column stays clean without forcing a meaningless field on the form.
    const effectiveStudentName = isOffice && orderForSelf ? parentName : studentName;
    const effectiveGrade = labels.showGrade ? grade : "";
    const payload = {
      parentName, parentEmail,
      schoolId: selectedDelivery?.school.id,
      deliveryDateId: selectedDeliveryDateId,
      parentChildId: selectedParentChildId || undefined,
      studentName: effectiveStudentName,
      grade: effectiveGrade,
      // Expand qty: the server treats each entry as one unit, so qty=3
      // becomes 3 cart entries (and 3 OrderItem rows). Keeps the API/DB
      // unchanged while letting the UI collapse identical configurations.
      cartItems: cartItems.flatMap((i) =>
        Array.from({ length: i.quantity }, () => ({
          menuItemId: i.menuItemId, choice: i.choice, size: i.size, additions: i.additions, removals: i.removals,
        })),
      ),
      allergyNotes, dietaryNotes: null, specialInstructions: null,
      // Promo code only — auto discounts are re-evaluated server-side
      // and don't need to be carried by the client.
      discountCode: codeApplied || undefined,
    };
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/checkout/create-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Unable to start checkout."); return; }
      window.location.href = data.checkoutUrl;
    } finally {
      setIsSubmitting(false);
    }
  }

  // Progress steps are: Date, Menu, Recipient, Review
  const progressSteps = ["Date", "Menu", "Recipient", "Review"];

  return (
    <div className="pb-48">
      {/* Reorder unavailability notice */}
      {unavailableReorderItems.length > 0 && (() => {
        const allNeedsSelection = needsSelectionItems.length === unavailableReorderItems.length;
        const hasNotOnMenu = unavailableReorderItems.length > needsSelectionItems.length;
        const hasBoth = needsSelectionItems.length > 0 && hasNotOnMenu;

        let title: string;
        let body: string;
        if (allNeedsSelection) {
          title = needsSelectionItems.length === 1
            ? "1 item needs a selection"
            : `${needsSelectionItems.length} items need a selection`;
          body = `${needsSelectionItems.join(", ")} ${needsSelectionItems.length === 1 ? "requires" : "require"} a choice or size — tap each one in the menu below to pick your option.`;
        } else if (hasBoth) {
          const notOnMenu = unavailableReorderItems.filter((n) => !needsSelectionItems.includes(n));
          title = "Some items couldn't be carried over";
          body = `${needsSelectionItems.join(", ")} ${needsSelectionItems.length === 1 ? "needs" : "need"} a selection; ${notOnMenu.join(", ")} ${notOnMenu.length === 1 ? "isn't" : "aren't"} on today's menu.`;
        } else {
          title = unavailableReorderItems.length === 1
            ? "1 item isn't available for this date"
            : `${unavailableReorderItems.length} items aren't available for this date`;
          body = `${unavailableReorderItems.join(", ")} ${unavailableReorderItems.length === 1 ? "has" : "have"} been removed from your cart. Pick a replacement from the menu below.`;
        }

        return (
          <div style={{
            borderRadius: 14, border: "1px solid #E3DBC6",
            background: "#F6F1E6", padding: "12px 14px",
            display: "flex", gap: 10, alignItems: "flex-start",
            marginBottom: 16,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0673E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#211D15", marginBottom: 2 }}>{title}</p>
              <p style={{ fontSize: 12, color: "#C0673E", lineHeight: 1.5 }}>{body}</p>
            </div>
          </div>
        );
      })()}

      {/* Progress */}
      <div className="flex items-center gap-1 mb-4">
        {progressSteps.map((label, i) => (
          <div key={label} className="flex-1 h-1 rounded-full transition-colors" style={{
            backgroundColor: i < step - 1 || (i === step - 1 && step > 1) ? "#2C4031" : "#E3DBC6"
          }} />
        ))}
      </div>
      <div className="flex justify-between mb-6">
        {progressSteps.map((label, i) => (
          <span key={label} className={cn("text-[10px] font-medium", i + 1 === step ? "text-editorial-ink" : "text-editorial-ink-faint")}>
            {label}
          </span>
        ))}
      </div>

      {/* Persistent cart summary (visible from Step 2+) */}
      {step >= 2 && cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t" style={{ backgroundColor: "#F6F1E6", borderColor: "#E3DBC6" }}>
          <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: "#211D15" }}>
              {totalUnits} item{totalUnits !== 1 ? "s" : ""} • {fmt(totalCents)}
            </span>
            {step < 4 && (
              <button type="button" onClick={() => { window.history.pushState({ orderStep: step + 1 }, ""); setStep((step + 1) as Step); }}
                className="text-[12px] font-medium px-3 py-1.5 rounded-full transition"
                style={{ backgroundColor: "#2C4031", color: "#F6F1E6" }}>
                Next →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50 max-w-xs">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="px-4 py-3 rounded-lg text-[13px] font-medium text-white animate-in fade-in slide-in-from-right-2 duration-300"
            style={{ backgroundColor: toast.type === "success" ? "#2C4031" : "#C0673E" }}
          >
            {toast.type === "success" ? "✓ " : "⚠ "}{toast.message}
          </div>
        ))}
      </div>

      {/* STEP 1: Location + Date */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#938B78" }}>
              {/* "School" / "Office" — or "Location" when the tenant mixes both */}
              {(() => {
                const types = new Set(schools.map((s) => s.locationType));
                if (types.size > 1) return "Location";
                if (types.has("OFFICE")) return "Office";
                return "School";
              })()}
            </p>
            {useDropdown ? (
              <select
                value={selectedSchoolId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSchoolId(id);
                  setSelectedDeliveryDateId(deliveryDates.find((d) => d.school.id === id)?.id ?? "");
                  setCartItems([]);
                  setSelectedMenuItemId("");
                }}
                className="w-full rounded-[14px] border p-3.5 text-[14px] font-semibold"
                style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6", color: "#211D15" }}
              >
                <option value="" disabled>Select a location</option>
                {groupedSchools.school.length > 0 && groupedSchools.office.length > 0 ? (
                  <>
                    <optgroup label="Schools">
                      {groupedSchools.school.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Offices">
                      {groupedSchools.office.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                )}
              </select>
            ) : (
              schools.map((school) => (
                <button
                  key={school.id}
                  type="button"
                  onClick={() => { setSelectedSchoolId(school.id); setSelectedDeliveryDateId(deliveryDates.find((d) => d.school.id === school.id)?.id ?? ""); setCartItems([]); setSelectedMenuItemId(""); }}
                  className={cn("w-full rounded-[14px] border p-3.5 text-left mb-2 transition", selectedSchoolId === school.id ? "border-2" : "border")}
                  style={{
                    backgroundColor: selectedSchoolId === school.id ? "#F6F1E6" : "#FCFAF3",
                    borderColor: selectedSchoolId === school.id ? "#2C4031" : "#E3DBC6",
                  }}
                >
                  <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>{school.name}</p>
                  <p className="text-[12px] mt-0.5" style={{ color: selectedSchoolId === school.id ? "#2C4031" : "#938B78" }}>
                    {school.locationType === "OFFICE" ? "Office" : "School"}
                  </p>
                </button>
              ))
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: "#938B78" }}>Delivery date</p>
            {!selectedSchoolId && (
              <p className="text-[13px] rounded-xl px-3 py-2.5" style={{ backgroundColor: "#F6F1E6", color: "#938B78" }}>
                Choose {schools.some((s) => s.locationType === "OFFICE") && schools.some((s) => s.locationType === "SCHOOL") ? "a location" : isOffice ? "an office" : "a school"} above to see available dates.
              </p>
            )}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {schoolDeliveryDates.map((date) => {
                const sel = selectedDeliveryDateId === date.id;
                return (
                  <button
                    key={date.id}
                    type="button"
                    onClick={() => { setSelectedDeliveryDateId(date.id); setCartItems([]); setSelectedMenuItemId(""); }}
                    className={cn("flex-shrink-0 rounded-[12px] border p-3 text-center min-w-[60px] transition", sel ? "border-2" : "border")}
                    style={{
                      backgroundColor: sel ? "#F6F1E6" : "#FCFAF3",
                      borderColor: sel ? "#2C4031" : "#E3DBC6",
                    }}
                  >
                    <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: sel ? "#2C4031" : "#938B78" }}>
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "EEE")}
                    </p>
                    <p className="text-[18px] font-semibold leading-none" style={{ color: "#211D15" }}>
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "d")}
                    </p>
                    <p className="text-[9px] mt-0.5" style={{ color: sel ? "#2C4031" : "#938B78" }}>
                      {formatInTimeZone(date.deliveryDate, date.school.timezone, "MMM")}
                    </p>
                    <p className="text-[8px] mt-1 leading-tight" style={{ color: "#938B78" }}>
                      by {formatInTimeZone(date.cutoffAt, date.school.timezone, "h:mm a")}
                    </p>
                  </button>
                );
              })}
            </div>
            {selectedDelivery && (() => {
              const deadline = getTimeToDeadline(selectedDelivery.cutoffAt, selectedDelivery.school.timezone);
              return (
                <div className="mt-3 rounded-xl px-3 py-2.5 text-[13px]" style={{ backgroundColor: "#F6F1E6", color: "#211D15" }}>
                  Order by <strong>{formatInTimeZone(selectedDelivery.cutoffAt, selectedDelivery.school.timezone, "EEEE h:mm a")}</strong> — {deadline.display}
                </div>
              );
            })()}
          </div>
          <button type="button" onClick={() => {
            if (!selectedSchoolId) {
              setError(`Choose a ${isOffice ? "office" : "school"}.`);
              return;
            }
            if (!selectedDeliveryDateId) { setError("Choose a delivery date."); return; }
            setError("");
            window.history.pushState({ orderStep: 2 }, "");
            setStep(2);
          }}
            className="w-full py-3 rounded-xl text-white text-[14px] font-semibold"
            style={{ backgroundColor: "#2C4031" }}>
            Continue →
          </button>
          {error && <p className="text-[13px] rounded-xl px-3 py-2" style={{ color: "#C0673E", backgroundColor: "#F6F1E6" }}>{error}</p>}
        </div>
      )}

      {/* STEP 3: Recipient & Contact */}
      {step === 3 && (
        <div className="space-y-4">
          <button type="button" onClick={() => window.history.back()} className="text-[12px] flex items-center gap-1 mb-2" style={{ color: "#938B78" }}>← Back</button>

          {/* Saved profiles — only shown for school locations. Office orders
              are typically self-service and don't carry "saved coworkers". */}
          {!isOffice && savedChildren.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: "#938B78" }}>Ordering for</p>
              <div className="flex gap-2 flex-wrap mb-1">
                {savedChildren.filter((c) => c.schoolId === selectedSchoolId).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedParentChildId(child.id)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium border transition"
                    style={{
                      backgroundColor: selectedParentChildId === child.id ? "#211D15" : "#FCFAF3",
                      color: selectedParentChildId === child.id ? "#F6F1E6" : "#938B78",
                      borderColor: selectedParentChildId === child.id ? "#211D15" : "#E3DBC6",
                    }}
                  >
                    {child.studentName}{labels.showGrade ? `, Gr ${child.grade}` : ""}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedParentChildId("")}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium border transition"
                  style={{
                    backgroundColor: !selectedParentChildId ? "#211D15" : "#FCFAF3",
                    color: !selectedParentChildId ? "#F6F1E6" : "#938B78",
                    borderColor: !selectedParentChildId ? "#211D15" : "#E3DBC6",
                    borderStyle: !selectedParentChildId ? "solid" : "dashed",
                  }}
                >
                  + Manual entry
                </button>
              </div>
            </div>
          )}

          {/* Office: "Ordering for myself" toggle. When on we hide the
              recipient name field and mirror parentName → studentName on
              submit. Toggling it off lets the orderer place an order for a
              coworker. */}
          {isOffice && (
            <label className="flex items-center gap-2 rounded-[14px] border px-3 py-2.5 cursor-pointer" style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6" }}>
              <input
                type="checkbox"
                checked={orderForSelf}
                onChange={(e) => setOrderForSelf(e.target.checked)}
                className="h-4 w-4 rounded"
                style={{ borderColor: "#E3DBC6" }}
              />
              <span className="text-[13px]" style={{ color: "#211D15" }}>Ordering for myself</span>
              <span className="text-[12px] ml-auto" style={{ color: "#938B78" }}>Uncheck if ordering for a coworker</span>
            </label>
          )}

          <div className="rounded-[18px] border p-4 space-y-3" style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6" }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] mb-1 block" style={{ color: "#938B78" }}>
                  {isOffice ? "Your name" : "Parent name"}
                </label>
                <input className="w-full rounded-xl text-[13px] px-3 py-2" value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Your name" required style={{ backgroundColor: "white", borderColor: "#E3DBC6" }} />
              </div>
              <div>
                <label className="text-[12px] mb-1 block" style={{ color: "#938B78" }}>
                  {isOffice ? "Your email" : "Parent email"}
                </label>
                <input type="email" className="w-full rounded-xl text-[13px] px-3 py-2" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="email@example.com" required style={{ backgroundColor: "white", borderColor: "#E3DBC6" }} />
              </div>

              {/* Recipient name — hidden for office self-orders, shown otherwise */}
              {!(isOffice && orderForSelf) && (
                <div>
                  <label className="text-[12px] mb-1 block" style={{ color: "#938B78" }}>{labels.unitName}</label>
                  <input
                    className="w-full rounded-xl text-[13px] px-3 py-2"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder={labels.unitName}
                    required
                    style={{ backgroundColor: "white", borderColor: "#E3DBC6" }}
                  />
                </div>
              )}

              {/* Grade — schools only */}
              {labels.showGrade && (
                <div>
                  <label className="text-[12px] mb-1 block" style={{ color: "#938B78" }}>{labels.grade}</label>
                  <select className="w-full rounded-xl text-[13px] px-3 py-2" value={grade} onChange={(e) => setGrade(e.target.value)} required style={{ backgroundColor: "white", borderColor: "#E3DBC6", color: "#211D15" }}>
                    <option value="" disabled>Select {labels.grade.toLowerCase()}</option>
                    {gradeOptions.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="text-[12px] mb-1 block" style={{ color: "#938B78" }}>
                {isOffice ? "Allergies / dietary notes" : "Allergy notes"}
              </label>
              <textarea
                className="w-full rounded-xl text-[13px] px-3 py-2 resize-none"
                rows={2}
                value={allergyNotes}
                onChange={(e) => setAllergyNotes(e.target.value)}
                placeholder={isOffice ? "e.g. vegan, gluten-free..." : "e.g. nut allergy, no dairy..."}
                style={{ backgroundColor: "white", borderColor: "#E3DBC6" }}
              />
            </div>
          </div>
          <button type="button" onClick={() => {
            // For office self-orders, auto-fill recipient with the orderer's name
            const effectiveStudentName = isOffice && orderForSelf ? parentName : studentName;
            if (!parentName || !parentEmail) {
              setError("Fill in your name and email.");
              return;
            }
            if (!isValidEmail(parentEmail)) {
              setError("Enter a valid email address.");
              return;
            }
            if (!effectiveStudentName) {
              setError(`Enter the ${labels.unitName.toLowerCase()}.`);
              return;
            }
            if (labels.showGrade && !grade) {
              setError(`Select a ${labels.grade.toLowerCase()}.`);
              return;
            }
            if (isOffice && orderForSelf) setStudentName(parentName);
            setError("");
            window.history.pushState({ orderStep: 4 }, "");
            setStep(4);
          }}
            className="w-full py-3 rounded-xl text-white text-[14px] font-semibold"
            style={{ backgroundColor: "#2C4031" }}>
            Review & pay →
          </button>
          {error && <p className="text-[13px] rounded-xl px-3 py-2" style={{ color: "#C0673E", backgroundColor: "#F6F1E6" }}>{error}</p>}
        </div>
      )}

      {/* STEP 2: Menu & Cart */}
      {step === 2 && (
        <div ref={menuScrollRef}>
          <button type="button" onClick={() => window.history.back()} className="text-[12px] flex items-center gap-1 mb-3" style={{ color: "#938B78" }}>← Back</button>
          {/* (Per-restaurant menu disclaimers — e.g. "Hand Slaughtered Halal" —
              previously hardcoded here for one tenant; removed so every
              restaurant's menu starts clean. If we ever need this back, drive
              it from a configurable field on the Restaurant model so each
              tenant controls their own copy.) */}
          <div className="rounded-[14px] px-3 py-2.5 mb-4 text-[13px] flex justify-between items-center border" style={{ backgroundColor: "#F6F1E6", borderColor: "#E3DBC6", color: "#211D15" }}>
            <span>{selectedDelivery?.school.name}</span>
            <span className="font-semibold">{formatInTimeZone(selectedDelivery!.deliveryDate, selectedDelivery!.school.timezone, "EEE MMM d")}</span>
          </div>

          {Object.entries(groupedMenuItems).map(([category, items]) => (
            <div key={category} className="mb-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] mb-2 flex items-center gap-1.5" style={{ color: "#938B78" }}>
                <span>{getCategoryIcon(category)}</span>{category}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map((item) => {
                  const isSelected = selectedMenuItemId === item.id;
                  const cartQty = cartItems.reduce((s, c) => c.menuItemId === item.id ? s + c.quantity : s, 0);
                  const inCart = cartQty > 0;
                  const isSoldOut = soldOutIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isSoldOut}
                      onClick={() => {
                        if (isSoldOut) return;
                        setSelectedMenuItemId(item.id); setSelectedChoice(""); setSelectedAdditions([]); setSelectedRemovals([]); setError("");
                      }}
                      className="w-full rounded-[14px] border p-3 text-left flex gap-2.5 items-start transition"
                      style={{
                        borderColor: isSoldOut ? "#E3DBC6" : isSelected ? "#2C4031" : inCart ? "#2C4031" : "#E3DBC6",
                        backgroundColor: isSoldOut ? "#F6F1E6" : isSelected ? "#F6F1E6" : inCart ? "#EFE8D7" : "#FCFAF3",
                        opacity: isSoldOut ? 0.6 : 1,
                        cursor: isSoldOut ? "not-allowed" : "pointer",
                        borderWidth: isSelected ? "2px" : "1px",
                      }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          width={36}
                          height={36}
                          className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border"
                          style={{ borderColor: "#E3DBC6" }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: "#DEE2CF" }}>
                          {getCategoryIcon(category)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[14px] font-semibold leading-snug" style={{ color: isSoldOut ? "#938B78" : "#211D15" }}>
                            {item.name}
                            {!isSoldOut && getRequiredChoicesForMenuItem(item).length > 0 && (
                              <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#DEE2CF", color: "#2C4031" }}>choose style</span>
                            )}
                            {isSoldOut && (
                              <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#DEE2CF", color: "#938B78" }}>sold out</span>
                            )}
                          </p>
                          <span className="text-[14px] font-semibold flex-shrink-0" style={{ color: isSoldOut ? "#938B78" : "#211D15", textDecoration: isSoldOut ? "line-through" : "none" }}>
                            {(() => {
                              // Sized items: show a range "$4–$6". When only one
                              // size exists it reads as a single price (no dash).
                              const sizes = item.sizes ?? [];
                              if (sizes.length > 0) {
                                const prices = sizes.map((s) => s.priceCents);
                                const min = Math.min(...prices);
                                const max = Math.max(...prices);
                                return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
                              }
                              return fmt(item.basePriceCents);
                            })()}
                          </span>
                        </div>
                        {getDesc(item) && <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "#938B78" }}>{getDesc(item)}</p>}
                        {inCart && !isSoldOut && (
                          <p className="text-[11px] font-medium mt-1" style={{ color: "#2C4031" }}>
                            ✓ In cart{cartQty > 1 ? ` (${cartQty})` : ""}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Customize panel */}
          {selectedMenuItem && (
            <div ref={customizePanelRef} className="rounded-[18px] border-2 p-4 mb-4 space-y-3" style={{ backgroundColor: "#F6F1E6", borderColor: "#E3DBC6" }}>
              <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>Customize: {selectedMenuItem.name}</p>

              {/* Size picker — radio chips with absolute prices. Renders
                  ABOVE required-choices so the customer commits to size
                  first (since size drives the total price). */}
              {(selectedMenuItem.sizes ?? []).length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: "#211D15" }}>Size — choose one</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedMenuItem.sizes ?? []).map((size) => {
                      const active = selectedSize === size.name;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => setSelectedSize(size.name)}
                          className="px-3 py-1.5 rounded-full border text-[12px] font-semibold transition"
                          style={{
                            backgroundColor: active ? "#F6F1E6" : "#FCFAF3",
                            borderColor: active ? "#2C4031" : "#E3DBC6",
                            color: active ? "#2C4031" : "#938B78",
                          }}
                        >
                          {size.name}
                          <span className="ml-1.5 text-[11px] font-normal" style={{ color: active ? "#2C4031" : "#938B78" }}>
                            {fmt(size.priceCents)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {requiredChoices.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: "#211D15" }}>Required — choose one</p>
                  <div className="space-y-1.5">
                    {requiredChoices.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setSelectedChoice(choice)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[12px] text-left transition"
                        style={{
                          borderColor: selectedChoice === choice ? "#2C4031" : "#E3DBC6",
                          backgroundColor: "#FCFAF3",
                          color: selectedChoice === choice ? "#2C4031" : "#938B78",
                          fontWeight: selectedChoice === choice ? "600" : "400",
                        }}
                      >
                        <div className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center" style={{
                          borderColor: selectedChoice === choice ? "#2C4031" : "#E3DBC6",
                          backgroundColor: selectedChoice === choice ? "#2C4031" : "transparent",
                        }}>
                          {selectedChoice === choice && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#F6F1E6" }} />}
                        </div>
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: "#211D15" }}>Add-ons</p>
                  <div className="space-y-1.5">
                    {selectedMenuItem.options.filter((o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name)).map((option) => (
                      <button key={option.id} type="button" onClick={() => toggle(option.name, selectedAdditions, setSelectedAdditions)}
                        className="w-full px-2.5 py-1.5 rounded-full text-[11px] border text-left transition"
                        style={{
                          backgroundColor: selectedAdditions.includes(option.name) ? "#DEE2CF" : "#FCFAF3",
                          borderColor: selectedAdditions.includes(option.name) ? "#2C4031" : "#E3DBC6",
                          color: selectedAdditions.includes(option.name) ? "#2C4031" : "#938B78",
                          fontWeight: selectedAdditions.includes(option.name) ? "600" : "400",
                        }}>
                        + {option.name}{option.priceDeltaCents ? ` +${fmt(option.priceDeltaCents)}` : ""}
                      </button>
                    ))}
                    {selectedMenuItem.options.filter((o) => o.optionType === "ADD_ON" && !requiredChoices.includes(o.name)).length === 0 &&
                      <p className="text-[11px]" style={{ color: "#938B78" }}>None available</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: "#211D15" }}>Remove</p>
                  <div className="space-y-1.5">
                    {selectedMenuItem.options.filter((o) => o.optionType === "REMOVAL").map((option) => (
                      <button key={option.id} type="button" onClick={() => toggle(option.name, selectedRemovals, setSelectedRemovals)}
                        className="w-full px-2.5 py-1.5 rounded-full text-[11px] border text-left transition"
                        style={{
                          backgroundColor: selectedRemovals.includes(option.name) ? "#C0673E" : "#FCFAF3",
                          borderColor: selectedRemovals.includes(option.name) ? "#C0673E" : "#E3DBC6",
                          color: selectedRemovals.includes(option.name) ? "#F6F1E6" : "#938B78",
                          fontWeight: selectedRemovals.includes(option.name) ? "600" : "400",
                        }}>
                        No {option.name}
                      </button>
                    ))}
                    {selectedMenuItem.options.filter((o) => o.optionType === "REMOVAL").length === 0 &&
                      <p className="text-[11px]" style={{ color: "#938B78" }}>None available</p>}
                  </div>
                </div>
              </div>

              {error && <p className="text-[13px] rounded-xl px-3 py-2" style={{ color: "#C0673E", backgroundColor: "#F6F1E6" }}>{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={addToCart}
                  className="flex-1 py-2.5 rounded-xl text-white text-[14px] font-semibold"
                  style={{ backgroundColor: "#2C4031" }}>
                  Add to cart — {fmt(selectedItemTotalCents)}
                </button>
                <button type="button" onClick={() => setSelectedMenuItemId("")}
                  className="px-4 py-2.5 rounded-xl border text-[13px]"
                  style={{ borderColor: "#E3DBC6", backgroundColor: "#FCFAF3", color: "#938B78" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Cart */}
          {cartItems.length > 0 && (
            <div className="rounded-[18px] border p-4 mb-4" style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "#938B78" }}>
                Your cart {totalUnits > 0 ? `· ${totalUnits} item${totalUnits === 1 ? "" : "s"}` : ""}
              </p>
              <div style={{ borderColor: "#E3DBC6", borderTopWidth: "1px" }}>
                {cartItems.map((item) => {
                  const lineTotal = item.lineTotalCents * item.quantity;
                  return (
                    <div key={item.id} className="py-2.5 flex gap-3 items-start justify-between" style={{ borderBottomColor: "#E3DBC6", borderBottomWidth: "1px" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>
                          {item.itemName}
                          {item.size && <span style={{ color: "#938B78", fontWeight: "normal" }}> · {item.size}</span>}
                        </p>
                        <p className="text-[12px] leading-snug" style={{ color: "#938B78" }}>
                          {[item.choice ? `${item.choice}` : "", item.additions.length ? `+ ${item.additions.join(", ")}` : "", item.removals.length ? `No: ${item.removals.join(", ")}` : ""].filter(Boolean).join(" · ") || "No customizations"}
                        </p>
                        <p className="text-[12px] mt-0.5" style={{ color: "#938B78" }}>
                          {fmt(lineTotal)}
                          {item.quantity > 1 && <span> · {fmt(item.lineTotalCents)} each</span>}
                        </p>
                      </div>
                      {/* Qty stepper */}
                      <div className="flex items-center gap-1 rounded-full px-1 py-1 flex-shrink-0" style={{ borderColor: "#E3DBC6", borderWidth: "1px", backgroundColor: "#F6F1E6" }}>
                        <button
                          type="button"
                          onClick={() => decrementCartItem(item.id)}
                          aria-label={item.quantity > 1 ? `Decrease ${item.itemName}` : `Remove ${item.itemName}`}
                          className="w-7 h-7 rounded-full text-[14px] font-semibold flex items-center justify-center hover:opacity-75"
                          style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6", color: "#938B78", borderWidth: "1px" }}
                        >
                          {item.quantity > 1 ? "−" : "×"}
                        </button>
                        <span className="text-[12px] font-semibold min-w-[18px] text-center tabular-nums" style={{ color: "#211D15" }}>
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => incrementCartItem(item.id)}
                          aria-label={`Add another ${item.itemName}`}
                          className="w-7 h-7 rounded-full text-[14px] font-semibold flex items-center justify-center hover:opacity-75"
                          style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6", color: "#938B78", borderWidth: "1px" }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="pt-3 mt-1 flex justify-between" style={{ borderTopColor: "#E3DBC6", borderTopWidth: "1px" }}>
                <span className="text-[14px] font-semibold" style={{ color: "#211D15" }}>Total</span>
                <span className="text-[16px] font-semibold" style={{ color: "#211D15" }}>{fmt(totalCents)}</span>
              </div>
            </div>
          )}

          <button type="button" onClick={() => { if (!cartItems.length) { setError("Add at least one item first."); return; } setError(""); window.history.pushState({ orderStep: 3 }, ""); setStep(3); }}
            disabled={!cartItems.length}
            className="w-full py-3 rounded-xl text-white text-[14px] font-semibold disabled:opacity-30"
            style={{ backgroundColor: "#2C4031" }}>
            Continue →
          </button>
          {error && <p className="text-[13px] rounded-xl px-3 py-2 mt-2" style={{ color: "#C0673E", backgroundColor: "#F6F1E6" }}>{error}</p>}
        </div>
      )}

      {/* STEP 4: Review & Pay */}
      {step === 4 && (
        <div className="space-y-4">
          <button type="button" onClick={() => window.history.back()} className="text-[12px] flex items-center gap-1 mb-2" style={{ color: "#938B78" }}>← Back</button>

          <div className="rounded-[18px] border overflow-hidden" style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6" }}>
            <div className="p-4 border-b" style={{ borderColor: "#E3DBC6" }}>
              <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "#938B78" }}>Delivery</p>
              <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>{selectedDelivery && formatInTimeZone(selectedDelivery.deliveryDate, selectedDelivery.school.timezone, "EEEE, MMMM d")}</p>
              <p className="text-[12px]" style={{ color: "#938B78" }}>{selectedDelivery?.school.name}</p>
            </div>
            <div className="p-4 border-b" style={{ borderColor: "#E3DBC6" }}>
              <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "#938B78" }}>{labels.unit}</p>
              <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>{studentName || (isOffice && orderForSelf ? parentName : "")}</p>
              <p className="text-[12px]" style={{ color: "#938B78" }}>
                {labels.showGrade && grade ? `${labels.grade} ${grade}` : ""}
                {labels.showGrade && grade && allergyNotes ? " · " : ""}
                {allergyNotes ? `${isOffice ? "Notes" : "Allergy"}: ${allergyNotes}` : ""}
              </p>
            </div>
            <div className="p-4 border-b" style={{ borderColor: "#E3DBC6" }}>
              <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "#938B78" }}>Order</p>
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between mb-2">
                  <div>
                    <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>
                      {item.quantity > 1 && <span style={{ color: "#938B78" }}>{item.quantity}× </span>}
                      {item.itemName}
                      {item.size && <span style={{ color: "#938B78", fontWeight: "normal" }}> · {item.size}</span>}
                    </p>
                    <p className="text-[12px]" style={{ color: "#938B78" }}>{[item.choice, item.additions.length ? `+ ${item.additions.join(", ")}` : "", item.removals.length ? `No: ${item.removals.join(", ")}` : ""].filter(Boolean).join(" · ")}</p>
                  </div>
                  <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>{fmt(item.lineTotalCents * item.quantity)}</p>
                </div>
              ))}

              {/* Subtotal row — shown only when a discount has applied,
                  so the receipt-style "Subtotal / Discount / Total" stack
                  reads naturally. With no discount we keep the original
                  single "Order total" row to avoid visual noise. */}
              {totalDiscountCents > 0 && (
                <div className="flex justify-between pt-3 mt-1 text-[12px]" style={{ borderTopColor: "#E3DBC6", borderTopWidth: "1px", color: "#938B78" }}>
                  <span>Subtotal</span>
                  <span>{fmt(totalCents)}</span>
                </div>
              )}

              {/* Auto-applied discount line */}
              {previewAuto && (
                <div className="flex justify-between mt-1 text-[12px]" style={{ color: "#2C4031", fontWeight: "600" }}>
                  <span>🎁 {previewAuto.name}</span>
                  <span>−{fmt(previewAuto.amountCents)}</span>
                </div>
              )}

              {/* Code discount line */}
              {previewCode && (
                <div className="flex justify-between mt-1 text-[12px]" style={{ color: "#2C4031", fontWeight: "600" }}>
                  <span>🏷️ {previewCode.name}{codeApplied ? ` (${codeApplied})` : ""}</span>
                  <span>−{fmt(previewCode.amountCents)}</span>
                </div>
              )}

              {/* Promo code section — collapsed by default. When applied,
                  we replace the input with a "Remove" affordance so the
                  customer can clear the code without retyping. */}
              <div className="pt-3 mt-3" style={{ borderTopColor: "#E3DBC6", borderTopWidth: "1px" }}>
                {!previewCode && !codeInputOpen && (
                  <button
                    type="button"
                    onClick={() => setCodeInputOpen(true)}
                    className="text-[12px] font-semibold hover:underline"
                    style={{ color: "#2C4031" }}
                  >
                    Have a promo code?
                  </button>
                )}
                {!previewCode && codeInputOpen && (
                  <div className="flex gap-2 items-stretch">
                    <input
                      value={codeInput}
                      onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setCodeError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleApplyCode(); } }}
                      placeholder="Promo code"
                      aria-label="Promo code"
                      autoFocus
                      className="flex-1 rounded-lg px-3 py-2 text-[13px] font-mono tracking-wider uppercase focus:outline-none"
                      style={{ backgroundColor: "#FCFAF3", borderColor: "#E3DBC6", borderWidth: "1px", color: "#211D15" }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCode}
                      disabled={previewBusy}
                      className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold disabled:opacity-50"
                      style={{ backgroundColor: "#211D15" }}
                    >
                      {previewBusy ? "…" : "Apply"}
                    </button>
                  </div>
                )}
                {previewCode && (
                  <div className="flex justify-between items-center text-[11px]">
                    <span style={{ color: "#938B78" }}>Code applied</span>
                    <button
                      type="button"
                      onClick={handleRemoveCode}
                      className="hover:underline font-medium"
                      style={{ color: "#C0673E" }}
                    >
                      Remove code
                    </button>
                  </div>
                )}
                {codeError && (
                  <p className="text-[11px] mt-1.5" style={{ color: "#C0673E" }}>{codeError}</p>
                )}
              </div>

              <div className="flex justify-between pt-3 mt-3" style={{ borderTopColor: "#E3DBC6", borderTopWidth: "1px" }}>
                <span className="text-[14px] font-semibold" style={{ color: "#211D15" }}>Order total</span>
                <span className="text-[18px] font-semibold" style={{ color: "#211D15" }}>{fmt(finalTotalCents)}</span>
              </div>
            </div>
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "#938B78" }}>Contact</p>
              <p className="text-[14px] font-semibold" style={{ color: "#211D15" }}>{parentName}</p>
              <p className="text-[12px]" style={{ color: "#938B78" }}>{parentEmail}</p>
            </div>
          </div>

          <div className="rounded-xl px-3 py-2.5 text-[13px] flex gap-2" style={{ backgroundColor: "#F6F1E6", color: "#211D15" }}>
            <span>🔒</span>
            <span>You'll be redirected to <strong>Stripe</strong> for secure payment. Confirmation sent by email.</span>
          </div>

          {error && <p className="text-[13px] rounded-xl px-3 py-2" style={{ color: "#C0673E", backgroundColor: "#F6F1E6" }}>{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl text-white text-[14px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: "#2C4031" }}>
            {isSubmitting ? "Processing..." : "Pay with Stripe →"}
          </button>
        </div>
      )}
    </div>
  );
}
