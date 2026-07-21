import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all external dependencies of the route handler BEFORE importing it.
// We want to verify the routing/dispatch logic — that the `cancel` action goes
// through adminCancelOrderWithRefund (real Stripe refund path), not the old
// setOrderStatus (DB-only status flip that left payments captured).

// vi.mock() factories are hoisted above imports, so any references they close
// over must also be hoisted via vi.hoisted().
const {
  assertAdminApiRequestMock,
  setOrderStatusMock,
  setOrderArchivedMock,
  adminCancelOrderWithRefundMock,
  sendOrderConfirmationEmailMock,
} = vi.hoisted(() => ({
  assertAdminApiRequestMock: vi.fn(),
  setOrderStatusMock: vi.fn(),
  setOrderArchivedMock: vi.fn(),
  adminCancelOrderWithRefundMock: vi.fn(),
  sendOrderConfirmationEmailMock: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  assertAdminApiRequest: assertAdminApiRequestMock,
}));

vi.mock("@/lib/admin", () => ({
  setOrderStatus: setOrderStatusMock,
  setOrderArchived: setOrderArchivedMock,
  adminCancelOrderWithRefund: adminCancelOrderWithRefundMock,
}));

vi.mock("@/lib/email/service", () => ({
  sendOrderConfirmationEmail: sendOrderConfirmationEmailMock,
}));

// The route also imports prisma from @/lib/db (for GET) — stub it so importing
// the module doesn't try to connect to a real DB.
vi.mock("@/lib/db", () => ({
  prisma: { order: { findFirst: vi.fn() } },
}));

// @prisma/client OrderStatus is a real enum — import lazily via the route module.
// The route's imports of it are resolved once vi.mock hoists above take effect.
import { PATCH } from "@/app/api/admin/orders/[orderId]/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/orders/order-123", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ orderId: "order-123" });

// Default: MANAGER-level admin, tenant scoped. Individual tests override.
function grantRole(_minRole?: string) {
  assertAdminApiRequestMock.mockResolvedValue({
    restaurantId: "rest-1",
    adminUserId: "admin-1",
  });
}

function denyRole() {
  assertAdminApiRequestMock.mockRejectedValue(new Error("Insufficient permissions"));
}

function denyAuth() {
  assertAdminApiRequestMock.mockRejectedValue(new Error("Unauthorized"));
}

describe("PATCH /api/admin/orders/[orderId] — quick-action dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cancel action (real Stripe refund path)", () => {
    it("dispatches cancel to adminCancelOrderWithRefund, NOT setOrderStatus", async () => {
      // Regression guard for the bug this branch fixes: previously `cancel`
      // called setOrderStatus(orderId, CANCELLED) which never touched Stripe.
      grantRole("MANAGER");
      adminCancelOrderWithRefundMock.mockResolvedValue(undefined);

      const res = await PATCH(makeRequest({ action: "cancel" }), { params });

      expect(res.status).toBe(200);
      expect(adminCancelOrderWithRefundMock).toHaveBeenCalledTimes(1);
      expect(adminCancelOrderWithRefundMock).toHaveBeenCalledWith(
        "rest-1",
        "order-123",
        "admin-1"
      );
      // Critical negative assertion: the old buggy path must NOT run.
      expect(setOrderStatusMock).not.toHaveBeenCalled();
    });

    it("requires MANAGER role — STAFF cannot cancel (403)", async () => {
      denyRole();
      const res = await PATCH(makeRequest({ action: "cancel" }), { params });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("Insufficient permissions");
      // Role check was requested with MANAGER as the minimum.
      expect(assertAdminApiRequestMock).toHaveBeenCalledWith("MANAGER");
      expect(adminCancelOrderWithRefundMock).not.toHaveBeenCalled();
      expect(setOrderStatusMock).not.toHaveBeenCalled();
    });

    it("propagates refund errors as 400 with the underlying message", async () => {
      grantRole("MANAGER");
      adminCancelOrderWithRefundMock.mockRejectedValue(
        new Error("Stripe refund failed: charge already refunded")
      );

      const res = await PATCH(makeRequest({ action: "cancel" }), { params });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Stripe refund failed: charge already refunded");
    });

    it("returns 401 when the caller is not authenticated at all", async () => {
      denyAuth();
      const res = await PATCH(makeRequest({ action: "cancel" }), { params });
      expect(res.status).toBe(401);
      expect(adminCancelOrderWithRefundMock).not.toHaveBeenCalled();
    });
  });

  describe("refund action", () => {
    it("requires MANAGER role", async () => {
      grantRole("MANAGER");
      setOrderStatusMock.mockResolvedValue(undefined);

      const res = await PATCH(makeRequest({ action: "refund" }), { params });

      expect(res.status).toBe(200);
      expect(assertAdminApiRequestMock).toHaveBeenCalledWith("MANAGER");
      expect(setOrderStatusMock).toHaveBeenCalledTimes(1);
      // refund action still flips DB status to REFUNDED (unchanged behavior).
      const [rid, oid, status] = setOrderStatusMock.mock.calls[0];
      expect(rid).toBe("rest-1");
      expect(oid).toBe("order-123");
      expect(String(status)).toBe("REFUNDED");
    });
  });

  describe("archive / unarchive actions (STAFF-allowed, unchanged behavior)", () => {
    it("archive requests only STAFF and forwards adminUserId for the activity log", async () => {
      grantRole("STAFF");
      setOrderArchivedMock.mockResolvedValue(undefined);

      const res = await PATCH(makeRequest({ action: "archive" }), { params });

      expect(res.status).toBe(200);
      expect(assertAdminApiRequestMock).toHaveBeenCalledWith("STAFF");
      // Fix under test also added adminUserId attribution.
      expect(setOrderArchivedMock).toHaveBeenCalledWith(
        "rest-1",
        "order-123",
        true,
        "admin-1"
      );
    });

    it("unarchive requests only STAFF and forwards adminUserId", async () => {
      grantRole("STAFF");
      setOrderArchivedMock.mockResolvedValue(undefined);

      const res = await PATCH(makeRequest({ action: "unarchive" }), { params });

      expect(res.status).toBe(200);
      expect(assertAdminApiRequestMock).toHaveBeenCalledWith("STAFF");
      expect(setOrderArchivedMock).toHaveBeenCalledWith(
        "rest-1",
        "order-123",
        false,
        "admin-1"
      );
    });

    it("STAFF is still permitted to archive even when denied on cancel", async () => {
      // Simulate a session where hasRole('STAFF','MANAGER') = false but
      // hasRole('STAFF','STAFF') = true, by branching on the requested role.
      assertAdminApiRequestMock.mockImplementation(async (minRole?: string) => {
        if (minRole === "MANAGER" || minRole === "OWNER") {
          throw new Error("Insufficient permissions");
        }
        return { restaurantId: "rest-1", adminUserId: "admin-1" };
      });
      setOrderArchivedMock.mockResolvedValue(undefined);

      const cancelRes = await PATCH(makeRequest({ action: "cancel" }), { params });
      expect(cancelRes.status).toBe(403);

      const archiveRes = await PATCH(makeRequest({ action: "archive" }), { params });
      expect(archiveRes.status).toBe(200);
      expect(setOrderArchivedMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("resend_confirmation action (STAFF-allowed)", () => {
    it("dispatches to sendOrderConfirmationEmail with tenant scoping", async () => {
      grantRole("STAFF");
      sendOrderConfirmationEmailMock.mockResolvedValue(undefined);

      const res = await PATCH(makeRequest({ action: "resend_confirmation" }), { params });

      expect(res.status).toBe(200);
      expect(assertAdminApiRequestMock).toHaveBeenCalledWith("STAFF");
      expect(sendOrderConfirmationEmailMock).toHaveBeenCalledWith("order-123", "rest-1");
    });
  });

  describe("unknown / malformed actions", () => {
    it("rejects unknown action with 400 BEFORE running the auth check", async () => {
      const res = await PATCH(makeRequest({ action: "delete_everything" }), { params });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("Unsupported action.");
      // No auth check needed — action was rejected up front, so no info leak
      // about which roles map to which action.
      expect(assertAdminApiRequestMock).not.toHaveBeenCalled();
      expect(adminCancelOrderWithRefundMock).not.toHaveBeenCalled();
      expect(setOrderStatusMock).not.toHaveBeenCalled();
    });

    it("rejects a missing action field with 400", async () => {
      const res = await PATCH(makeRequest({}), { params });
      expect(res.status).toBe(400);
      expect(assertAdminApiRequestMock).not.toHaveBeenCalled();
    });
  });
});
