/**
 * QA: Multi-PI cancel
 *
 * When an order has a deltaPaymentIntentId (from a finalized increase-edit),
 * both cancelOrderWithRefund and adminCancelOrderWithRefund must refund both
 * payment intents — delta PI first, then original PI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const { mockPrisma, mockStripe, mockLogActivity } = vi.hoisted(() => {
  const mockStripe = {
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    coupons: { create: vi.fn() },
  };

  // For cancelOrderWithRefund: uses prisma.$transaction(async tx => ...)
  // We need to call the callback and return a thenable result.
  const cancelledOrder = {
    id: "order-1",
    orderNumber: "SL-001",
    restaurantId: "rest-1",
    parentUserId: "parent-1",
    totalCents: 700,
    status: "CANCELLED",
    school: { timezone: "America/Los_Angeles" },
    deliveryDate: { cutoffAt: new Date(Date.now() - 60_000), deliveryDate: new Date() },
    student: { studentName: "Alice" },
    items: [],
  };

  const txMock = {
    payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    order: { update: vi.fn().mockResolvedValue(cancelledOrder) },
  };

  const mockPrisma = {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    orderItem: { update: vi.fn() },
    student: { update: vi.fn() },
    payment: { update: vi.fn(), updateMany: vi.fn() },
    processedWebhookEvent: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((fn: unknown) => {
      if (typeof fn === "function") return fn(txMock);
      // Array form: resolve with mock values
      return Promise.resolve([{ count: 1 }, cancelledOrder]);
    }),
    _cancelledOrder: cancelledOrder,
    _txMock: txMock,
  };

  const mockLogActivity = vi.fn().mockResolvedValue(undefined);
  return { mockPrisma, mockStripe, mockLogActivity };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/payments/stripe", () => ({ stripe: mockStripe }));
vi.mock("@/lib/activity", () => ({ logActivity: mockLogActivity }));
// Prevent real email sends
vi.mock("@/lib/email/service", () => ({
  sendCancellationEmail: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  sendOrderModifiedEmail: vi.fn(),
}));

import { cancelOrderWithRefund } from "@/lib/orders";
import { adminCancelOrderWithRefund } from "@/lib/admin";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date();
const FUTURE_CUTOFF = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
const PAST_CUTOFF = new Date(NOW.getTime() - 60_000);
const DELIVERY_DATE = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

/** Order with no delta payment intent (pre-increase-edit scenario). */
function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SL-001",
    restaurantId: "rest-1",
    parentUserId: "parent-1",
    studentId: "student-1",
    status: "PAID",
    totalCents: 500,
    paymentIntentId: "pi_original_abc",
    refundAmountCents: 0,
    deltaPaymentIntentId: null,
    deltaAmountCents: null,
    school: { timezone: "America/Los_Angeles" },
    deliveryDate: { cutoffAt: FUTURE_CUTOFF, deliveryDate: DELIVERY_DATE },
    student: { id: "student-1", studentName: "Alice" },
    items: [{ id: "item-1" }],
    payment: { id: "pay-1", amountCents: 500, providerPaymentIntent: "pi_original_abc" },
    restaurant: { stripeAccountId: null },
    ...overrides,
  };
}

/** Order that has completed an increase-edit (delta PI set). */
function makeOrderWithDeltaPI(overrides: Record<string, unknown> = {}) {
  return makeOrder({
    totalCents: 700,       // was increased from 500
    deltaPaymentIntentId: "pi_delta_xyz",
    deltaAmountCents: 200,
    ...overrides,
  });
}

// ── cancelOrderWithRefund (customer path) ─────────────────────────────────────

describe("cancelOrderWithRefund — multi-PI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_test" });

    const cancelledOrder = {
      id: "order-1",
      orderNumber: "SL-001",
      restaurantId: "rest-1",
      parentUserId: "parent-1",
      totalCents: 700,
      status: "CANCELLED",
      school: { timezone: "America/Los_Angeles" },
      deliveryDate: { cutoffAt: PAST_CUTOFF, deliveryDate: DELIVERY_DATE },
      student: { studentName: "Alice" },
      items: [],
    };
    const txMock = {
      payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      order: { update: vi.fn().mockResolvedValue(cancelledOrder) },
    };
    mockPrisma.$transaction.mockImplementation((fn: unknown) => {
      if (typeof fn === "function") return fn(txMock);
      return Promise.resolve([{ count: 1 }, cancelledOrder]);
    });
    (mockPrisma as Record<string, unknown>)._txMock = txMock;
  });

  it("no delta PI: only one stripe.refunds.create call (original PI)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());

    await cancelOrderWithRefund({ orderId: "order-1", parentUserId: "parent-1" });

    expect(mockStripe.refunds.create).toHaveBeenCalledOnce();
    const [call1] = mockStripe.refunds.create.mock.calls[0];
    expect(call1.payment_intent).toBe("pi_original_abc");
  });

  it("with delta PI: two stripe.refunds.create calls — delta PI first, then original", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrderWithDeltaPI());

    await cancelOrderWithRefund({ orderId: "order-1", parentUserId: "parent-1" });

    expect(mockStripe.refunds.create).toHaveBeenCalledTimes(2);

    const firstCall = mockStripe.refunds.create.mock.calls[0][0];
    const secondCall = mockStripe.refunds.create.mock.calls[1][0];

    // Delta PI must come first
    expect(firstCall.payment_intent).toBe("pi_delta_xyz");
    // Original PI second
    expect(secondCall.payment_intent).toBe("pi_original_abc");
  });

  it("with delta PI: if delta Stripe refund throws, error propagates; DB is NOT updated", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrderWithDeltaPI());
    mockStripe.refunds.create.mockRejectedValueOnce(new Error("Stripe error on delta PI"));

    await expect(
      cancelOrderWithRefund({ orderId: "order-1", parentUserId: "parent-1" })
    ).rejects.toThrow("Stripe error on delta PI");

    // DB transaction must NOT have run
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("cross-tenant: throws 'Not authorized' when parentUserId does not match", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());

    await expect(
      cancelOrderWithRefund({ orderId: "order-1", parentUserId: "wrong-parent" })
    ).rejects.toThrow("Not authorized to cancel this order");

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});

// ── adminCancelOrderWithRefund ────────────────────────────────────────────────

describe("adminCancelOrderWithRefund — multi-PI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_admin_test" });

    const cancelledOrder = {
      id: "order-1",
      orderNumber: "SL-001",
      restaurantId: "rest-1",
      status: "CANCELLED",
      totalCents: 700,
      student: { studentName: "Alice" },
    };
    // adminCancelOrderWithRefund uses the array form of $transaction
    mockPrisma.$transaction.mockResolvedValue([{ count: 1 }, cancelledOrder]);
  });

  it("with delta PI: refunds delta PI first, then original PI", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrderWithDeltaPI());

    await adminCancelOrderWithRefund("rest-1", "order-1", "admin-1");

    expect(mockStripe.refunds.create).toHaveBeenCalledTimes(2);
    const firstCall = mockStripe.refunds.create.mock.calls[0][0];
    const secondCall = mockStripe.refunds.create.mock.calls[1][0];
    expect(firstCall.payment_intent).toBe("pi_delta_xyz");
    expect(secondCall.payment_intent).toBe("pi_original_abc");
  });

  it("without delta PI: only one stripe.refunds.create call", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder());

    await adminCancelOrderWithRefund("rest-1", "order-1", "admin-1");

    expect(mockStripe.refunds.create).toHaveBeenCalledOnce();
    expect(mockStripe.refunds.create.mock.calls[0][0].payment_intent).toBe("pi_original_abc");
  });

  it("Stripe throws on delta PI refund: error is caught; cancel proceeds to DB (admin catch block)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrderWithDeltaPI());
    // First refunds.create (delta PI) throws; second (original PI) succeeds
    mockStripe.refunds.create
      .mockRejectedValueOnce(new Error("delta PI already fully refunded"))
      .mockResolvedValueOnce({ id: "re_orig_abc" });

    // adminCancelOrderWithRefund catches Stripe errors and continues
    await expect(
      adminCancelOrderWithRefund("rest-1", "order-1", "admin-1")
    ).resolves.not.toThrow();

    // DB transaction still ran despite the Stripe error
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it("throws 'Order not found' when restaurantId does not match (cross-tenant)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);

    await expect(
      adminCancelOrderWithRefund("wrong-rest", "order-1", "admin-1")
    ).rejects.toThrow(/not found/i);

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});
