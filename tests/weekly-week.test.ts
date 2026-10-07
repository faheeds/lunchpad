import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import {
  getUpcomingOrderingWindowRange,
  getWeekdayNumber,
  getWeekScopeRange,
  parseWeekScope,
  pickWeekScope
} from "@/lib/weekly-week";

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

describe("week scope helpers", () => {
  const tz = "America/Los_Angeles";
  const now = new Date("2026-10-07T20:00:00.000Z"); // Wed Oct 7, 2026 1pm PDT

  it("current week runs from today through Sunday; next week is Mon-Sun after", () => {
    const cur = getWeekScopeRange(now, tz, "current");
    const nxt = getWeekScopeRange(now, tz, "next");
    expect(formatInTimeZone(cur.start, tz, "yyyy-MM-dd")).toBe("2026-10-07");
    expect(formatInTimeZone(cur.end, tz, "yyyy-MM-dd")).toBe("2026-10-11");
    expect(formatInTimeZone(nxt.start, tz, "yyyy-MM-dd")).toBe("2026-10-12");
    expect(formatInTimeZone(nxt.end, tz, "yyyy-MM-dd")).toBe("2026-10-18");
  });

  it("parseWeekScope only accepts current/next", () => {
    expect(parseWeekScope("current")).toBe("current");
    expect(parseWeekScope("next")).toBe("next");
    expect(parseWeekScope("all")).toBeNull();
    expect(parseWeekScope(undefined)).toBeNull();
  });

  it("pickWeekScope defaults to next, honors requests, and falls back when a week is empty", () => {
    const thu8 = new Date("2026-10-08T19:00:00.000Z");
    const mon12 = new Date("2026-10-12T19:00:00.000Z");
    const both = pickWeekScope({ now, timezone: tz, dates: [thu8, mon12] });
    expect(both).toMatchObject({ scope: "next", hasCurrent: true, hasNext: true });
    expect(pickWeekScope({ requested: "current", now, timezone: tz, dates: [thu8, mon12] }).scope).toBe("current");
    // only this week has dates -> falls back to current even if next requested
    expect(pickWeekScope({ requested: "next", now, timezone: tz, dates: [thu8] }).scope).toBe("current");
    // only next week has dates -> next even if current requested
    expect(pickWeekScope({ requested: "current", now, timezone: tz, dates: [mon12] }).scope).toBe("next");
  });
});
