/**
 * Render a Discount as a human-readable English sentence — the same
 * string is used in the admin list row, the customer-facing receipt
 * line, and the activity-log timeline. Centralizing it here keeps
 * those surfaces from drifting out of sync.
 *
 * Examples:
 *   "10% off first order at any school"
 *   "$3 off when ordering for 2+ students"
 *   "20% off with code WELCOME20"
 *   "$5 off Tuesday orders over $25"
 *
 * Design: build a sentence by concatenating fragments. Skip fragments
 * for fields that hold their default value so we don't say "at any
 * school for any amount on any day" — operators tune that out fast.
 */

import type { Discount } from "@prisma/client";

export function describeDiscount(d: Discount): string {
  const parts: string[] = [];

  // 1. Amount + what (the verb)
  parts.push(`${formatAmount(d)} off`);

  // 2. Item scope (if narrowed)
  if (d.scope === "ITEMS") {
    if (d.itemIds.length > 0 && d.categories.length === 0) {
      parts.push(d.itemIds.length === 1 ? "selected item" : `${d.itemIds.length} selected items`);
    } else if (d.categories.length > 0 && d.itemIds.length === 0) {
      // Render category name(s) directly — operators set these so they're
      // legible. Cap at three to keep sentence length sane.
      parts.push(d.categories.slice(0, 3).join(" / ") + (d.categories.length > 3 ? " + more" : ""));
    } else if (d.itemIds.length > 0 && d.categories.length > 0) {
      parts.push("selected items");
    }
  }

  // 3. Code vs. automatic
  if (d.code) {
    parts.push(`with code ${d.code}`);
  }

  // 4. Eligibility — accumulate conditions as a single "when" clause.
  const conditions: string[] = [];
  if (d.firstOrderOnly) {
    conditions.push("first order");
  }
  if (d.minItemCount !== null && d.minItemCount > 1) {
    conditions.push(`ordering for ${d.minItemCount}+ students`);
  }
  if (d.minOrderCents !== null && d.minOrderCents > 0) {
    conditions.push(`orders over ${formatCurrency(d.minOrderCents)}`);
  }
  if (d.weekdays.length > 0) {
    conditions.push(d.weekdays.length === 1 ? `${weekdayName(d.weekdays[0])} orders` : `${formatWeekdayList(d.weekdays)} orders`);
  }
  if (d.schoolIds.length > 0) {
    conditions.push(d.schoolIds.length === 1 ? "at selected location" : `at ${d.schoolIds.length} locations`);
  }
  if (conditions.length === 1) {
    parts.push(`on ${conditions[0]}`);
  } else if (conditions.length > 1) {
    parts.push("when " + conditions.join(" and "));
  }

  // 5. Window — only mention if there's an end date; "starts today" is
  // implicit. We don't surface the exact end date in the list view
  // (the detail page does) but we hint that it's time-bound.
  if (d.endsAt) {
    parts.push(`through ${formatShortDate(d.endsAt)}`);
  }

  return parts.join(" ");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAmount(d: Discount): string {
  return d.kind === "PERCENT" ? `${d.value}%` : formatCurrency(d.value);
}

function formatCurrency(cents: number): string {
  // Drop trailing .00 for whole dollar amounts — "$5" reads cleaner
  // than "$5.00" in the list view.
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function weekdayName(iso: number): string {
  return WEEKDAY_NAMES[iso - 1] ?? "weekday";
}

function formatWeekdayList(weekdays: number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b);
  // Detect weekday vs. weekend shorthand.
  const isWeekdays = sorted.length === 5 && sorted.every((d, i) => d === i + 1);
  if (isWeekdays) return "weekday";
  const isWeekend = sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7;
  if (isWeekend) return "weekend";
  return sorted.map((d) => weekdayName(d).slice(0, 3)).join("/");
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
