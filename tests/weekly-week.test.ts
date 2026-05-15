import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { getUpcomingOrderingWindowRange, getWeekdayNumber } from "@/lib/weekly-week";

describe("weekly week helpers", () => {
  it("returns ISO weekday numbers in a timezone", () => {
    const timezone = "America/Los_Angeles";
    expect(getWeekdayNumber(new Date("2026-04-13T12:00:00.000Z"), timezone)).toBe(1);
    expect(getWeekdayNumber(new Date("2026-04-17T12:00:00.000Z"), timezone)).toBe(5);
  });

  it("computes the ordering window as today through Sunday of next week", () => {
    // The window used to end on Friday — that was when LunchPad's
    // first operator (FS's Kitchen) only ran Mon-Thu. The platform is
    // now multi-tenant and weekend deliveries are valid, so the window
    // extends through Sunday of the following calendar week.
    const timezone = "America/Los_Angeles";
    const now = new Date("2026-04-16T18:00:00.000Z"); // Thu Apr 16, 2026 morning PDT
    const range = getUpcomingOrderingWindowRange(now, timezone);

    expect(formatInTimeZone(range.start, timezone, "yyyy-MM-dd HH:mm:ss")).toBe("2026-04-16 00:00:00");
    expect(formatInTimeZone(range.end, timezone, "yyyy-MM-dd HH:mm:ss")).toBe("2026-04-26 23:59:59");
  });
});
