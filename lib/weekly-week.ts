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

  const nextThursday = new Date(nextMonday);
  nextThursday.setDate(nextThursday.getDate() + 3); // Mon–Thu only (school schedule)

  return {
    start: buildLocalDayStart(nextMonday, timezone),
    end: buildLocalDayEnd(nextThursday, timezone)
  };
}

export function getSchoolWeekRangeForDate(date: Date, timezone: string) {
  const weekday = getWeekdayNumber(date, timezone);
  const daysSinceMonday = weekday - 1;
  const monday = new Date(date);
  monday.setDate(monday.getDate() - daysSinceMonday);

  // End on Thursday — school only provides lunch Mon–Thu.
  // Friday is kept as end for legacy data grouping so historical Friday
  // orders (if any) are still associated with the correct week.
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);

  return {
    start: buildLocalDayStart(monday, timezone),
    end: buildLocalDayEnd(thursday, timezone)
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
