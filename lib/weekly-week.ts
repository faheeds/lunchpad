import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

function buildLocalDayStart(date: Date, timezone: string) {
  return fromZonedTime(`${formatInTimeZone(date, timezone, "yyyy-MM-dd")} 00:00:00`, timezone);
}

function buildLocalDayEnd(date: Date, timezone: string) {
  return fromZonedTime(`${formatInTimeZone(date, timezone, "yyyy-MM-dd")} 23:59:59`, timezone);
}

export function getWeekdayNumber(date: Date, timezone: string) {
  return Number(formatInTimeZone(date, timezone, "i"));
}

export function getUpcomingSchoolWeekRange(now: Date, timezone: string) {
  const weekday = getWeekdayNumber(now, timezone);
  const daysUntilNextMonday = weekday === 1 ? 7 : 8 - weekday;
  const nextMonday = new Date(now);
  nextMonday.setDate(nextMonday.getDate() + daysUntilNextMonday);

  // End on Sunday so the range covers a full calendar week. Previously
  // capped at Thursday for FS's Kitchen's Mon-Thu schedule; multi-tenant
  // operators have varied schedules so we let the data drive what's
  // visible rather than this range.
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextSunday.getDate() + 6);

  return {
    start: buildLocalDayStart(nextMonday, timezone),
    end: buildLocalDayEnd(nextSunday, timezone)
  };
}

export type WeekScope = "current" | "next";

export function parseWeekScope(value: unknown): WeekScope | null {
  return value === "current" || value === "next" ? value : null;
}

/**
 * Range for ONE lunch week. "current" = now through this Sunday (the days
 * still left this week); "next" = next Monday through next Sunday. A weekly
 * checkout covers exactly one of these so days from different weeks are never
 * bundled (or discount-counted) together.
 */
export function getWeekScopeRange(now: Date, timezone: string, scope: WeekScope) {
  if (scope === "next") return getUpcomingSchoolWeekRange(now, timezone);
  const weekday = getWeekdayNumber(now, timezone);
  const sunday = new Date(now);
  sunday.setDate(sunday.getDate() + (7 - weekday));
  return {
    start: buildLocalDayStart(now, timezone),
    end: buildLocalDayEnd(sunday, timezone)
  };
}

/**
 * Decide which single week to show/check out. Honors `requested` when that
 * week has dates; otherwise defaults to next week, falling back to the rest
 * of this week when next week has nothing open.
 */
export function pickWeekScope(args: {
  requested?: WeekScope | null;
  now: Date;
  timezone: string;
  dates: Date[];
}) {
  const current = getWeekScopeRange(args.now, args.timezone, "current");
  const next = getWeekScopeRange(args.now, args.timezone, "next");
  const within = (d: Date, r: { start: Date; end: Date }) => d >= r.start && d <= r.end;
  const hasCurrent = args.dates.some((d) => within(d, current));
  const hasNext = args.dates.some((d) => within(d, next));
  let scope: WeekScope = args.requested ?? (hasNext ? "next" : "current");
  if (scope === "current" && !hasCurrent && hasNext) scope = "next";
  if (scope === "next" && !hasNext && hasCurrent) scope = "current";
  return { scope, hasCurrent, hasNext, range: scope === "next" ? next : current };
}

export function getSchoolWeekRangeForDate(date: Date, timezone: string) {
  const weekday = getWeekdayNumber(date, timezone);
  const daysSinceMonday = weekday - 1;
  const monday = new Date(date);
  monday.setDate(monday.getDate() - daysSinceMonday);

  // Full Mon-Sun calendar week. Previously capped at Thursday — see
  // comment on `getUpcomingSchoolWeekRange` above.
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return {
    start: buildLocalDayStart(monday, timezone),
    end: buildLocalDayEnd(sunday, timezone)
  };
}

// Used by the parent "Upcoming week planner": include any still-orderable
// delivery dates for the remainder of the current week, plus the entire
// next week. The previous implementation cut off at Thursday because
// LunchPad's first operator (FS's Kitchen) only ran Mon–Thu — but the
// platform is now multi-tenant and some restaurants schedule Fri / Sat /
// Sun deliveries too. End on Sunday so every weekday is in scope; the
// actual delivery dates surfaced are still whatever the operator created
// (no spurious empty days).
export function getUpcomingOrderingWindowRange(now: Date, timezone: string) {
  const weekday = getWeekdayNumber(now, timezone);
  const daysUntilNextMonday = weekday === 1 ? 7 : 8 - weekday;
  const nextMonday = new Date(now);
  nextMonday.setDate(nextMonday.getDate() + daysUntilNextMonday);

  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextSunday.getDate() + 6); // full Mon–Sun next week

  return {
    start: buildLocalDayStart(now, timezone),
    end: buildLocalDayEnd(nextSunday, timezone)
  };
}
