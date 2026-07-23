import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// All mocks must be hoisted so vi.mock() factories can reference them.
const {
  requireMobileAuthMock,
  findUniqueMock,
  findManyMock,
} = vi.hoisted(() => ({
  requireMobileAuthMock: vi.fn(),
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/mobile-bearer", () => ({
  requireMobileAuth: requireMobileAuthMock,
  options: () => new Response(null, { status: 204 }),
  CORS_HEADERS: {},
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    parentUser: { findUnique: findUniqueMock },
    deliveryDate: { findMany: findManyMock },
  },
}));

import { GET } from "@/app/api/mobile/native/weekly-plans/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Fixed "now" = Wednesday 2026-07-23 14:00 UTC (10:00 AM Eastern).
// Using fake timers eliminates all timing-sensitive flakiness.
const FIXED_NOW = new Date("2026-07-23T14:00:00.000Z");

const DEFAULT_AUTH = {
  parentUserId: "parent-1",
  restaurantId: "rest-1",
};

const DEFAULT_CHILD = {
  id: "child-1",
  schoolId: "school-1",
  school: {
    id: "school-1",
    name: "Lincoln Elementary",
    timezone: "America/New_York",
    locationType: "SCHOOL",
  },
  studentName: "Alex",
  grade: "3rd",
  archivedAt: null,
};

function makeParent(overrides: Record<string, unknown> = {}) {
  return {
    id: "parent-1",
    children: [DEFAULT_CHILD],
    weeklyPlans: [],
    ...overrides,
  };
}

function makeDeliveryDate(deliveryDate: Date) {
  return {
    id: "dd-1",
    schoolId: "school-1",
    deliveryDate,
    cutoffAt: new Date(deliveryDate.getTime() - 12 * 60 * 60 * 1000),
    school: DEFAULT_CHILD.school,
    menuAvailability: [],
  };
}

function makeRequest() {
  return new Request("http://localhost/api/mobile/native/weekly-plans", {
    headers: { Authorization: "Bearer fake-token" },
  });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("GET /api/mobile/native/weekly-plans — single-week window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    findUniqueMock.mockResolvedValue(makeParent());
    findManyMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. Happy path — 200 with correct response shape
  it("happy path: authenticated parent with one date → 200 with correct fields", async () => {
    // Next Wednesday 2026-07-29 in the context of our fixed "now" of 2026-07-23
    const nextWed = new Date("2026-07-29T15:00:00.000Z");
    findManyMock.mockResolvedValue([makeDeliveryDate(nextWed)]);

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].id).toBe("child-1");
    expect(body.deliveryDates).toHaveLength(1);
    expect(body.deliveryDates[0].id).toBe("dd-1");
    expect(body.deliveryDates[0].deliveryDate).toBe("2026-07-29T15:00:00.000Z");
    expect(Array.isArray(body.plans)).toBe(true);
  });

  // 2. Key acceptance: date range spans at most 7 days — prevents duplicate weekdays
  //
  // With the buggy getUpcomingOrderingWindowRange the range is:
  //   { start: now (Jul 23), end: next-Sunday (Aug 3) } — ~11 days, two Fridays in scope.
  // With the fixed getUpcomingSchoolWeekRange the range is:
  //   { start: next-Monday (Jul 28), end: next-Sunday (Aug 3) } — 6d 23h 59m 59s ≤ 7 days.
  it("acceptance: findMany date range spans at most 7 days (no duplicate weekdays possible)", async () => {
    await GET(makeRequest() as never);

    expect(findManyMock).toHaveBeenCalledOnce();
    const callArgs = findManyMock.mock.calls[0][0];
    const gte: Date = callArgs.where.deliveryDate.gte;
    const lte: Date = callArgs.where.deliveryDate.lte;

    const spanMs = lte.getTime() - gte.getTime();
    expect(spanMs).toBeLessThanOrEqual(SEVEN_DAYS_MS);
  });

  // 3. Adversarial: range start is strictly in the future (not "now" / start-of-today)
  //
  // getUpcomingOrderingWindowRange sets start = buildLocalDayStart(now, tz) = today at
  // midnight ET = 2026-07-23T04:00:00Z, which is in the past relative to FIXED_NOW.
  // getUpcomingSchoolWeekRange sets start = next Monday midnight ET = 2026-07-28T04:00:00Z,
  // which is 5 days after FIXED_NOW — strictly in the future.
  it("adversarial: range start is a future Monday, not start-of-today", async () => {
    await GET(makeRequest() as never);

    const callArgs = findManyMock.mock.calls[0][0];
    const gte: Date = callArgs.where.deliveryDate.gte;

    // Must be strictly after FIXED_NOW — the buggy function returns start-of-today
    // (2026-07-23T04:00:00Z) which is hours BEFORE FIXED_NOW.
    expect(gte.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  // 4. Auth failure → 401, no DB calls made
  it("auth failure: requireMobileAuth throws 401 → 401, no DB calls", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 })
    );

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  // 5. No children → deliveryDates empty, findMany never called
  it("no children: parent with empty children array → 200 with empty deliveryDates, findMany skipped", async () => {
    findUniqueMock.mockResolvedValue(makeParent({ children: [] }));

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deliveryDates).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  // 6. Parent not found → 404
  it("parent not found: findUnique returns null → 404", async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeTruthy();
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
