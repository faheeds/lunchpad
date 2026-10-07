/**
 * Pure helpers for multi-day ("weekly streak") discounts.
 *
 * A multi-day discount carries a tier table on the Discount row, e.g.
 *   [{ dayNumber: 3, percent: 25 }, { dayNumber: 4, percent: 50 }]
 * meaning: the family's 3rd distinct delivery day in a Mon-Sun week gets 25%
 * off, and their 4th (and any later) day gets 50% off. The "Nth day" is the
 * order's rank by delivery date among every distinct delivery day the family
 * has that week — already-paid orders plus the other days in the same
 * checkout. Kept free of Prisma so it is trivially unit-testable.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export interface WeeklyTier {
  /** The Nth distinct delivery day in the week this tier starts at (>= 1). */
  dayNumber: number;
  /** Percent off that day's subtotal (1..100). */
  percent: number;
}

/** Defensive parse of the JSON column — anything malformed yields no tiers,
 *  which makes the discount a no-op rather than throwing during checkout. */
export function parseWeeklyTiers(raw: unknown): WeeklyTier[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<number, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const dayNumber = Math.floor(Number((entry as { dayNumber?: unknown }).dayNumber));
    const percent = Number((entry as { percent?: unknown }).percent);
    if (!Number.isFinite(dayNumber) || dayNumber < 1) continue;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) continue;
    byDay.set(dayNumber, percent);
  }
  return [...byDay.entries()]
    .map(([dayNumber, percent]) => ({ dayNumber, percent }))
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

/** Percent off for the Nth day: the highest tier whose dayNumber <= n,
 *  or 0 when n is below every tier. */
export function tierPercentForDay(tiers: WeeklyTier[], dayNumber: number): number {
  let percent = 0;
  for (const tier of tiers) {
    if (tier.dayNumber <= dayNumber) percent = tier.percent;
  }
  return percent;
}

/** Local calendar date ("yyyy-MM-dd") of a delivery date in the school's timezone. */
export function localDateKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday ("yyyy-MM-dd") of the Mon-Sun week containing the given local date key. */
export function mondayKeyOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  const isoWeekday = dow === 0 ? 7 : dow;
  return addDaysToKey(key, -(isoWeekday - 1));
}

/** [start, end) instants of the Mon-Sun week (in `timezone`) containing `date`. */
export function weekWindow(date: Date, timezone: string): { start: Date; end: Date } {
  const monday = mondayKeyOf(localDateKey(date, timezone));
  return {
    start: fromZonedTime(`${monday} 00:00:00`, timezone),
    end: fromZonedTime(`${addDaysToKey(monday, 7)} 00:00:00`, timezone),
  };
}

/**
 * Which delivery day of the week is `targetDate` for this family?
 * = 1 + the number of DISTINCT earlier delivery days in the same Mon-Sun
 * week among `otherDates` (paid orders + other days in the same checkout).
 * Several orders on the same day (e.g. siblings) count as one day.
 */
export function dayNumberInWeek(args: {
  targetDate: Date;
  otherDates: Date[];
  timezone: string;
}): number {
  const targetKey = localDateKey(args.targetDate, args.timezone);
  const weekKey = mondayKeyOf(targetKey);
  const earlier = new Set<string>();
  for (const d of args.otherDates) {
    const key = localDateKey(d, args.timezone);
    if (key < targetKey && mondayKeyOf(key) === weekKey) earlier.add(key);
  }
  return earlier.size + 1;
}

/** Customer-facing one-liner for a tier table, e.g.
 *  "25% off your 3rd day and 50% off your 4th+ day each week". */
export function describeWeeklyTiers(tiers: WeeklyTier[]): string {
  if (tiers.length === 0) return "";
  const ord = (n: number) => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
  };
  return tiers
    .map((t, i) => `${t.percent}% off your ${ord(t.dayNumber)}${i === tiers.length - 1 ? "+" : ""} day`)
    .join(" and ") + " each week";
}
