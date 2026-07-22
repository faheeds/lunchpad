import { beforeEach, describe, expect, it, vi } from "vitest";

// All mocks hoisted so vi.mock() factories can reference them.
const {
  requireMobileAuthMock,
  findUniqueMock,
  updateOrderBeforeCutoffMock,
  cancelOrderWithRefundMock,
} = vi.hoisted(() => ({
  requireMobileAuthMock: vi.fn(),
  findUniqueMock: vi.fn(),
  updateOrderBeforeCutoffMock: vi.fn(),
  cancelOrderWithRefundMock: vi.fn(),
}));

vi.mock("@/lib/mobile-bearer", () => ({
  requireMobileAuth: requireMobileAuthMock,
  options: () => new Response(null, { status: 204 }),
  jsonOk: (data: unknown) => Response.json(data, { status: 200 }),
  jsonErr: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findUnique: findUniqueMock },
  },
}));

vi.mock("@/lib/orders", () => ({
  updateOrderBeforeCutoff: updateOrderBeforeCutoffMock,
  cancelOrderWithRefund: cancelOrderWithRefundMock,
}));

vi.mock("@/lib/email/service", () => ({
  sendCancellationEmail: vi.fn(),
  sendOrderModifiedEmail: vi.fn(),
}));

import { PATCH } from "@/app/api/mobile/native/orders/[orderId]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_AUTH = { parentUserId: "parent-1", restaurantId: "rest-1" };

const DEFAULT_ORDER = {
  id: "order-123",
  parentUserId: "parent-1",
  restaurantId: "rest-1",
};

const DEFAULT_UPDATED_ORDER = {
  id: "order-123",
  orderNumber: "SL-001",
  restaurantId: "rest-1",
};

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request(
    "http://localhost/api/mobile/native/orders/order-123",
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer fake-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ additions: [], removals: [], ...body }),
    }
  );
}

const params = Promise.resolve({ orderId: "order-123" });

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("PATCH /api/mobile/native/orders/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    findUniqueMock.mockResolvedValue(DEFAULT_ORDER);
    updateOrderBeforeCutoffMock.mockResolvedValue({
      action: "updated",
      order: DEFAULT_UPDATED_ORDER,
    });
  });

  // ── Auth / ownership ──────────────────────────────────────────────────────

  it("1. unauthenticated: requireMobileAuth throws { status: 401 } → 401", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 })
    );

    const res = await PATCH(makeRequest() as never, { params });
    expect(res.status).toBe(401);
    expect(updateOrderBeforeCutoffMock).not.toHaveBeenCalled();
  });

  it("2. order not found in DB pre-check: findUnique returns null → 404", async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Order not found.");
    expect(updateOrderBeforeCutoffMock).not.toHaveBeenCalled();
  });

  it("3. wrong tenant: order.restaurantId ≠ auth.restaurantId → 404", async () => {
    requireMobileAuthMock.mockResolvedValue({
      parentUserId: "parent-1",
      restaurantId: "rest-OTHER",
    });

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Order not found.");
    expect(updateOrderBeforeCutoffMock).not.toHaveBeenCalled();
  });

  it("4. wrong parent: restaurantId matches but order.parentUserId ≠ auth.parentUserId → 403", async () => {
    findUniqueMock.mockResolvedValue({
      ...DEFAULT_ORDER,
      parentUserId: "parent-SOMEONE-ELSE",
    });

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Not your order.");
    expect(updateOrderBeforeCutoffMock).not.toHaveBeenCalled();
  });

  it("5. valid auth + ownership → updateOrderBeforeCutoff is called", async () => {
    await PATCH(makeRequest() as never, { params });
    expect(updateOrderBeforeCutoffMock).toHaveBeenCalledTimes(1);
  });

  // ── Response shapes ───────────────────────────────────────────────────────

  it("6. updated response: action='updated' → 200 { action: 'updated', order: { ... } }", async () => {
    updateOrderBeforeCutoffMock.mockResolvedValue({
      action: "updated",
      order: DEFAULT_UPDATED_ORDER,
    });

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ action: "updated", order: DEFAULT_UPDATED_ORDER });
  });

  it("7. checkout_required response: action='checkout_required' → 200 { action: 'checkout_required', checkoutUrl }", async () => {
    const checkoutUrl = "https://checkout.stripe.com/pay/cs_test_abc123";
    updateOrderBeforeCutoffMock.mockResolvedValue({
      action: "checkout_required",
      checkoutUrl,
    });

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ action: "checkout_required", checkoutUrl });
  });

  // ── Error code mapping ────────────────────────────────────────────────────

  it("8. 'Order not found.' thrown by updateOrderBeforeCutoff → 404", async () => {
    updateOrderBeforeCutoffMock.mockRejectedValue(new Error("Order not found."));

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Order not found.");
  });

  it("9. 'Only paid orders can be modified.' → 409", async () => {
    updateOrderBeforeCutoffMock.mockRejectedValue(
      new Error("Only paid orders can be modified.")
    );

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("Only paid orders can be modified.");
  });

  it("10. 'You already have a pending edit in progress...' → 409", async () => {
    const msg =
      "You already have a pending edit in progress. Complete or wait for it to expire before submitting another.";
    updateOrderBeforeCutoffMock.mockRejectedValue(new Error(msg));

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe(msg);
  });

  it("11. 'This order has already been increased once...' → 409", async () => {
    const msg =
      "This order has already been increased once and cannot be increased again.";
    updateOrderBeforeCutoffMock.mockRejectedValue(new Error(msg));

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe(msg);
  });

  it("12. cutoff error: 'Ordering is closed for this delivery date.' → 422", async () => {
    updateOrderBeforeCutoffMock.mockRejectedValue(
      new Error("Ordering is closed for this delivery date.")
    );

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe("Ordering is closed for this delivery date.");
  });

  it("13. 'One or more add-ons are invalid.' → 422", async () => {
    updateOrderBeforeCutoffMock.mockRejectedValue(
      new Error("One or more add-ons are invalid.")
    );

    const res = await PATCH(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe("One or more add-ons are invalid.");
  });

  // ── Body field passthrough ────────────────────────────────────────────────

  it("14. body fields passed through correctly to updateOrderBeforeCutoff", async () => {
    const req = makeRequest({
      additions: ["Extra Cheese"],
      removals: ["Onions"],
      allergyNotes: "nut allergy",
      dietaryNotes: "vegetarian",
      specialInstructions: "cut in half",
      teacherName: "Ms. Smith",
      classroom: "Room 12",
    });

    await PATCH(req as never, { params });

    expect(updateOrderBeforeCutoffMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-123",
        parentUserId: "parent-1",
        additions: ["Extra Cheese"],
        removals: ["Onions"],
        allergyNotes: "nut allergy",
        dietaryNotes: "vegetarian",
        specialInstructions: "cut in half",
        teacherName: "Ms. Smith",
        classroom: "Room 12",
      })
    );
  });
});
