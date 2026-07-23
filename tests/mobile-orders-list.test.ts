import { beforeEach, describe, expect, it, vi } from "vitest";

// All mocks must be hoisted so vi.mock() factories can reference them.
const {
  requireMobileAuthMock,
  findManyMock,
} = vi.hoisted(() => ({
  requireMobileAuthMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/mobile-bearer", () => ({
  requireMobileAuth: requireMobileAuthMock,
  options: () => new Response(null, { status: 204 }),
  CORS_HEADERS: {},
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findMany: findManyMock },
  },
}));

import { GET } from "@/app/api/mobile/native/orders/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_AUTH = {
  parentUserId: "parent-1",
  restaurantId: "rest-1",
};

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "LUN-001",
    status: "PAID",
    totalCents: 895,
    createdAt: new Date("2025-12-15T10:00:00Z"),
    parentChildId: "child-1",
    deliveryDateId: "dd-1",
    school: { name: "Lincoln Elementary", timezone: "America/New_York" },
    deliveryDate: { deliveryDate: new Date("2025-12-19T11:00:00Z") },
    items: [
      {
        itemNameSnapshot: "Grilled Cheese",
        lineTotalCents: 895,
        additions: [],
        removals: [],
      },
    ],
    ...overrides,
  };
}

function makeRequest() {
  return new Request("http://localhost/api/mobile/native/orders", {
    headers: { Authorization: "Bearer fake-token" },
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("GET /api/mobile/native/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    findManyMock.mockResolvedValue([makeOrder()]);
  });

  // 1. Happy path — 200 with correct response shape
  it("happy path: authenticated parent has orders → 200 with correct fields", async () => {
    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    const order = body[0];
    expect(order.id).toBe("order-1");
    expect(order.orderNumber).toBe("LUN-001");
    expect(order.status).toBe("PAID");
    expect(order.totalCents).toBe(895);
    expect(order.schoolName).toBe("Lincoln Elementary");
    expect(order.deliveryDate).toBe("2025-12-19T11:00:00.000Z");
    expect(order.createdAt).toBe("2025-12-15T10:00:00.000Z");
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe("Grilled Cheese");
  });

  // 2. parentChildId is present in response
  it("parentChildId is present and matches the order's parentChildId", async () => {
    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(body[0].parentChildId).toBe("child-1");
  });

  // 3. deliveryDateId is present in response
  it("deliveryDateId is present and matches the order's deliveryDateId", async () => {
    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(body[0].deliveryDateId).toBe("dd-1");
  });

  // 4. Guest order: parentChildId is null
  it("guest order: parentChildId null → returned as null in response", async () => {
    findManyMock.mockResolvedValue([makeOrder({ parentChildId: null })]);

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body[0].parentChildId).toBeNull();
    // deliveryDateId must still be present
    expect(body[0].deliveryDateId).toBe("dd-1");
  });

  // 5. No orders → empty array
  it("no orders for parent → 200 with empty array", async () => {
    findManyMock.mockResolvedValue([]);

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  // 6. Auth failure → 401
  it("auth failure: requireMobileAuth throws 401 → 401 response", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 })
    );

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  // Adversarial: findMany scoped to authenticated parentUserId only
  it("adversarial: findMany is always scoped to authenticated parentUserId", async () => {
    await GET(makeRequest() as never);

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentUserId: "parent-1",
        }),
      })
    );
  });

  // Adversarial: DB error → 500
  it("adversarial: findMany throws unexpectedly → 500", async () => {
    findManyMock.mockRejectedValue(new Error("Connection pool exhausted"));

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeTruthy();
    expect(findManyMock).toHaveBeenCalledOnce();
  });
});
