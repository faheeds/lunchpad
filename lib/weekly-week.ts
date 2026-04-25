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

// Used by the parent "Upcoming week planner": include any still-orderable delivery dates
// for the remainder of the current week, plus the next school week.
export function getUpcomingOrderingWindowRange(now: Date, timezone: string) {
  const weekday = getWeekdayNumber(now, timezone);
  const daysUntilNextMonday = weekday === 1 ? 7 : 8 - weekday;
  const nextMonday = new Date(now);
  nextMonday.setDate(nextMonday.getDate() + daysUntilNextMonday);

  const nextThursday = new Date(nextMonday);
  nextThursday.setDate(nextThursday.getDate() + 3); // Mon–Thu only

  return {
    start: buildLocalDayStart(now, timezone),
    end: buildLocalDayEnd(nextThursday, timezone)
  };
}
