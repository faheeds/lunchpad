import { beforeEach, describe, expect, it, vi } from "vitest";

// All mocks must be hoisted so vi.mock() factories can reference them.
const {
  requireMobileAuthMock,
  findUniqueMock,
  cancelOrderWithRefundMock,
  sendCancellationEmailMock,
} = vi.hoisted(() => ({
  requireMobileAuthMock: vi.fn(),
  findUniqueMock: vi.fn(),
  cancelOrderWithRefundMock: vi.fn(),
  sendCancellationEmailMock: vi.fn(),
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
  cancelOrderWithRefund: cancelOrderWithRefundMock,
}));

vi.mock("@/lib/email/service", () => ({
  sendCancellationEmail: sendCancellationEmailMock,
}));

import { DELETE } from "@/app/api/mobile/native/orders/[orderId]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_AUTH = {
  parentUserId: "parent-1",
  restaurantId: "rest-1",
};

const DEFAULT_ORDER = {
  id: "order-123",
  parentUserId: "parent-1",
  restaurantId: "rest-1",
};

function makeRequest() {
  return new Request("http://localhost/api/mobile/native/orders/order-123", {
    method: "DELETE",
    headers: { Authorization: "Bearer fake-token" },
  });
}

const params = Promise.resolve({ orderId: "order-123" });

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("DELETE /api/mobile/native/orders/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults — individual tests override as needed.
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    findUniqueMock.mockResolvedValue(DEFAULT_ORDER);
    cancelOrderWithRefundMock.mockResolvedValue(undefined);
    sendCancellationEmailMock.mockResolvedValue(undefined);
  });

  // 1. Happy path
  it("happy path: authenticated parent cancels their own PAID order → 200 { ok: true }", async () => {
    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });

    expect(cancelOrderWithRefundMock).toHaveBeenCalledTimes(1);
    expect(cancelOrderWithRefundMock).toHaveBeenCalledWith({
      orderId: "order-123",
      parentUserId: "parent-1",
    });

    // Email is fired best-effort — verify it was invoked.
    expect(sendCancellationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendCancellationEmailMock).toHaveBeenCalledWith("order-123", "rest-1");
  });

  // 2. After cutoff
  it("after cutoff: cancelOrderWithRefund throws cutoff message → 422 with that message", async () => {
    const cutoffMsg = "Ordering is closed for December 19, 2025.";
    cancelOrderWithRefundMock.mockRejectedValue(new Error(cutoffMsg));

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe(cutoffMsg);
    // Email must not fire when cancel failed.
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
  });

  // 3. Wrong-tenant JWT
  it("wrong-tenant JWT: order.restaurantId ≠ auth.restaurantId → 404", async () => {
    requireMobileAuthMock.mockResolvedValue({
      parentUserId: "parent-1",
      restaurantId: "rest-OTHER",
    });

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Order not found.");
    expect(cancelOrderWithRefundMock).not.toHaveBeenCalled();
  });

  // 4. Different parent's order
  it("different parent's order: restaurantId matches but parentUserId ≠ → 403 'Not your order.'", async () => {
    findUniqueMock.mockResolvedValue({
      ...DEFAULT_ORDER,
      parentUserId: "parent-SOMEONE-ELSE",
    });

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Not your order.");
    expect(cancelOrderWithRefundMock).not.toHaveBeenCalled();
  });

  // 5. Non-PAID order
  it("non-PAID order: cancelOrderWithRefund throws 'Only paid orders can be cancelled.' → 409", async () => {
    cancelOrderWithRefundMock.mockRejectedValue(
      new Error("Only paid orders can be cancelled.")
    );

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("Only paid orders can be cancelled.");
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
  });

  // 6. Unauthenticated request
  it("unauthenticated request: requireMobileAuth throws { status: 401 } → 401", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized — sign in for this restaurant to continue."), {
        status: 401,
      })
    );

    const res = await DELETE(makeRequest() as never, { params });

    expect(res.status).toBe(401);
    expect(cancelOrderWithRefundMock).not.toHaveBeenCalled();
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
  });

  // 7. Order not found in DB
  it("order not found in DB: prisma.order.findUnique returns null → 404 'Order not found.'", async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Order not found.");
    expect(cancelOrderWithRefundMock).not.toHaveBeenCalled();
  });

  // 8. Email failure is swallowed
  it("email failure is swallowed: sendCancellationEmail rejects → still returns 200", async () => {
    sendCancellationEmailMock.mockRejectedValue(new Error("SMTP timeout"));

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    // Must still succeed even though email blew up.
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(cancelOrderWithRefundMock).toHaveBeenCalledTimes(1);
  });

  // Adversarial: cancelOrderWithRefund throws non-Error object → 500
  it("adversarial: cancelOrderWithRefund throws a non-Error object → 500 fallback", async () => {
    cancelOrderWithRefundMock.mockRejectedValue({ code: "UNKNOWN" });

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to cancel order.");
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
  });

  // Adversarial: cancelOrderWithRefund throws "Order not found." string → 404
  it("adversarial: cancelOrderWithRefund throws 'Order not found.' → 404 (race condition guard)", async () => {
    cancelOrderWithRefundMock.mockRejectedValue(new Error("Order not found."));

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Order not found.");
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
  });

  // Adversarial: cancelOrderWithRefund throws "Not authorized to cancel this order." → 403
  it("adversarial: cancelOrderWithRefund throws 'Not authorized to cancel this order.' → 403", async () => {
    cancelOrderWithRefundMock.mockRejectedValue(
      new Error("Not authorized to cancel this order.")
    );

    const res = await DELETE(makeRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Not authorized to cancel this order.");
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
  });
});
