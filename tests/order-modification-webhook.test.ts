/**
 * QA: Webhook — checkout.session.completed for checkoutType="order_edit_increase"
 *
 * Tests: happy path finalization, orphan webhook (order not found / session mismatch),
 * duplicate webhook guard, malformed metadata, and processedWebhookEvent dedup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const {
  mockPrisma,
  mockStripe,
  mockLogActivity,
  mockSendOrderModifiedEmail,
  mockSendOrderConfirmationEmail,
  mockSendWeeklyEmail,
  mockSendSubscriptionEmail,
  mockMarkOrderPaid,
  mockMarkWeeklyBatch,
} = vi.hoisted(() => {
  const mockStripe = {
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    coupons: { create: vi.fn() },
  };
  const txMock = {
    orderItem: { update: vi.fn().mockResolvedValue({}) },
    order: { update: vi.fn().mockResolvedValue({}) },
    payment: { update: vi.fn().mockResolvedValue({}) },
  };
  const mockPrisma = {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    orderItem: { update: vi.fn() },
    student: { update: vi.fn() },
    payment: { update: vi.fn(), updateMany: vi.fn() },
    restaurant: { update: vi.fn(), updateMany: vi.fn() },
    processedWebhookEvent: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn: unknown) => {
      if (typeof fn === "function") return fn(txMock);
      return Promise.resolve([]);
    }),
    _txMock: txMock,
  };
  const mockLogActivity = vi.fn().mockResolvedValue(undefined);
  const mockSendOrderModifiedEmail = vi.fn().mockResolvedValue(undefined);
  const mockSendOrderConfirmationEmail = vi.fn().mockResolvedValue(undefined);
  const mockSendWeeklyEmail = vi.fn().mockResolvedValue(undefined);
  const mockSendSubscriptionEmail = vi.fn().mockResolvedValue(undefined);
  const mockMarkOrderPaid = vi.fn();
  const mockMarkWeeklyBatch = vi.fn();
  return {
    mockPrisma,
    mockStripe,
    mockLogActivity,
    mockSendOrderModifiedEmail,
    mockSendOrderConfirmationEmail,
    mockSendWeeklyEmail,
    mockSendSubscriptionEmail,
    mockMarkOrderPaid,
    mockMarkWeeklyBatch,
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/payments/stripe", () => ({ stripe: mockStripe }));
vi.mock("@/lib/activity", () => ({ logActivity: mockLogActivity }));
vi.mock("@/lib/email/service", () => ({
  sendOrderModifiedEmail: mockSendOrderModifiedEmail,
  sendOrderConfirmationEmail: mockSendOrderConfirmationEmail,
  sendWeeklyOrderConfirmationEmail: mockSendWeeklyEmail,
  sendSubscriptionChangedEmail: mockSendSubscriptionEmail,
  sendCancellationEmail: vi.fn(),
}));
vi.mock("@/lib/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orders")>();
  return { ...actual, markOrderPaidByCheckoutSession: mockMarkOrderPaid };
});
vi.mock("@/lib/weekly-checkout", () => ({
  markWeeklyBatchPaidByCheckoutSession: mockMarkWeeklyBatch,
}));

import { POST } from "@/app/api/stripe/webhook/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DELTA_ITEMS_JSON = JSON.stringify({
  additions: ["Extra Cheese"],
  removals: [],
  allergyNotes: null,
  dietaryNotes: null,
  specialInstructions: null,
  lineTotalCents: 700,
});

function makeEditIncreaseEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_test_edit_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_delta_123",
        payment_intent: "pi_delta_xyz",
        amount_total: 200,
        metadata: {
          checkoutType: "order_edit_increase",
          orderId: "order-1",
          orderNumber: "SL-001",
          newTotalCents: "700",
          newItemsJson: DELTA_ITEMS_JSON,
        },
        ...overrides,
      },
    },
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SL-001",
    restaurantId: "rest-1",
    parentUserId: "parent-1",
    totalCents: 500,
    pendingEditCheckoutSession: "cs_delta_123", // matches the session ID in the event
    pendingEditTotalCents: 700,
    pendingEditCreatedAt: new Date(),
    deltaPaymentIntentId: null,
    deltaAmountCents: null,
    status: "PAID",
    items: [{ id: "item-1", additions: [], removals: [] }],
    payment: { id: "pay-1", amountCents: 500, providerPaymentIntent: "pi_original_abc" },
    ...overrides,
  };
}

async function callWebhook(event: unknown) {
  // stripe.webhooks.constructEvent is mocked — just return the event object
  mockStripe.webhooks.constructEvent.mockReturnValue(event);

  const req = new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "test_sig" },
    body: JSON.stringify(event),
  });

  return POST(req);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("webhook — order_edit_increase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.processedWebhookEvent.findUnique.mockResolvedValue(null); // not yet processed
    mockPrisma.processedWebhookEvent.create.mockResolvedValue({});
    mockLogActivity.mockResolvedValue(undefined);
    mockSendOrderModifiedEmail.mockResolvedValue(undefined);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_orphan_abc" });

    // Reset $transaction to call callback with fresh tx mocks
    const txMock = {
      orderItem: { update: vi.fn().mockResolvedValue({}) },
      order: { update: vi.fn().mockResolvedValue({}) },
      payment: { update: vi.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation((fn: unknown) => {
      if (typeof fn === "function") return fn(txMock);
      return Promise.resolve([]);
    });
    (mockPrisma as Record<string, unknown>)._txMock = txMock;
  });

  it("happy path: clears pendingEdit fields, sets deltaPaymentIntentId, updates payment, emails customer", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());

    const response = await callWebhook(makeEditIncreaseEvent());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);

    // Transaction ran
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    // Order was updated within the transaction
    const tx = (mockPrisma as Record<string, unknown>)._txMock as {
      order: { update: ReturnType<typeof vi.fn> };
      payment: { update: ReturnType<typeof vi.fn> };
      orderItem: { update: ReturnType<typeof vi.fn> };
    };
    expect(tx.order.update).toHaveBeenCalledOnce();
    const orderUpdateData = tx.order.update.mock.calls[0][0].data;
    expect(orderUpdateData.totalCents).toBe(700);
    expect(orderUpdateData.subtotalCents).toBe(700);
    expect(orderUpdateData.pendingEditCheckoutSession).toBeNull();
    expect(orderUpdateData.pendingEditTotalCents).toBeNull();
    expect(orderUpdateData.pendingEditCreatedAt).toBeNull();
    expect(orderUpdateData.deltaPaymentIntentId).toBe("pi_delta_xyz");
    expect(orderUpdateData.deltaAmountCents).toBe(200); // 700 - 500

    // Payment updated cumulatively — NOT overwriting providerPaymentIntent
    expect(tx.payment.update).toHaveBeenCalledOnce();
    const paymentUpdateData = tx.payment.update.mock.calls[0][0].data;
    expect(paymentUpdateData.amountCents).toBe(700); // 500 + 200
    expect(paymentUpdateData.providerPaymentIntent).toBeUndefined(); // NOT set

    // Email sent (best-effort)
    expect(mockSendOrderModifiedEmail).toHaveBeenCalledWith("order-1", "rest-1");

    // Activity logged
    expect(mockLogActivity).toHaveBeenCalled();

    // Event marked processed
    expect(mockPrisma.processedWebhookEvent.create).toHaveBeenCalledOnce();
  });

  it("orphan webhook — order not found: issues full refund, logs orphanRefunded: true", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_orphan_abc" });

    const response = await callWebhook(makeEditIncreaseEvent());

    expect(response.status).toBe(200);

    // Should refund the stray payment
    expect(mockStripe.refunds.create).toHaveBeenCalledOnce();
    const [refundArgs, refundOpts] = mockStripe.refunds.create.mock.calls[0];
    expect(refundArgs.payment_intent).toBe("pi_delta_xyz");
    expect(refundOpts?.idempotencyKey).toBe("edit-orphan-cs_delta_123");

    // Activity log must reflect actual success
    expect(mockLogActivity).toHaveBeenCalledOnce();
    const logCall = mockLogActivity.mock.calls[0][0];
    expect(logCall.summary).toMatch(/refunded/i);
    expect(logCall.summary).not.toMatch(/REFUND FAILED/i);
    expect(logCall.metadata.orphanRefunded).toBe(true);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("orphan webhook — order not found, refund fails: logs REFUND FAILED with error detail", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    mockStripe.refunds.create.mockRejectedValue(new Error("charge already refunded"));

    const response = await callWebhook(makeEditIncreaseEvent());

    expect(response.status).toBe(200); // still 200 so Stripe doesn't retry

    // Activity log must reflect the failure
    expect(mockLogActivity).toHaveBeenCalledOnce();
    const logCall = mockLogActivity.mock.calls[0][0];
    expect(logCall.summary).toMatch(/REFUND FAILED/i);
    expect(logCall.metadata.orphanRefunded).toBe(false);
    expect(logCall.metadata.orphanRefundError).toContain("charge already refunded");

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("orphan webhook — session mismatch: issues full refund, logs orphanRefunded: true", async () => {
    // Order has a DIFFERENT pendingEditCheckoutSession
    mockPrisma.order.findUnique.mockResolvedValue(
      makeOrder({ pendingEditCheckoutSession: "cs_some_other_session" })
    );
    mockStripe.refunds.create.mockResolvedValue({ id: "re_orphan_abc" });

    const response = await callWebhook(makeEditIncreaseEvent());

    expect(response.status).toBe(200);

    // Stray payment should be refunded
    expect(mockStripe.refunds.create).toHaveBeenCalledOnce();
    const [refundArgs, refundOpts] = mockStripe.refunds.create.mock.calls[0];
    expect(refundArgs.payment_intent).toBe("pi_delta_xyz");
    expect(refundOpts?.idempotencyKey).toBe("edit-orphan-cs_delta_123");

    // Activity log reflects success
    expect(mockLogActivity).toHaveBeenCalledOnce();
    const logCall = mockLogActivity.mock.calls[0][0];
    expect(logCall.summary).toMatch(/refunded/i);
    expect(logCall.metadata.orphanRefunded).toBe(true);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("orphan webhook — session mismatch, refund fails: logs REFUND FAILED with error detail", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(
      makeOrder({ pendingEditCheckoutSession: "cs_some_other_session" })
    );
    mockStripe.refunds.create.mockRejectedValue(new Error("payment_intent already refunded"));

    const response = await callWebhook(makeEditIncreaseEvent());

    expect(response.status).toBe(200);

    expect(mockLogActivity).toHaveBeenCalledOnce();
    const logCall = mockLogActivity.mock.calls[0][0];
    expect(logCall.summary).toMatch(/REFUND FAILED/i);
    expect(logCall.metadata.orphanRefunded).toBe(false);
    expect(logCall.metadata.orphanRefundError).toContain("payment_intent already refunded");

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("duplicate webhook — already finalized: no-op, no refund issued, returns 200", async () => {
    // After finalization, pendingEditCheckoutSession is null and deltaPaymentIntentId
    // is set to the PI that was charged. A duplicate webhook for the same session
    // should return 200 early without issuing a refund.
    //
    // The duplicate guard must be evaluated BEFORE the session-mismatch check:
    // `null !== session.id` is true, so without the guard ordering fix the orphan
    // refund path would fire instead. (Bug was present in the initial implementation;
    // fixed in commit b252c0e by reordering the else-if chain.)

    mockPrisma.order.findUnique.mockResolvedValue(
      makeOrder({
        pendingEditCheckoutSession: null,     // cleared after finalization
        deltaPaymentIntentId: "pi_delta_xyz", // same PI as the duplicate webhook
      })
    );

    const response = await callWebhook(makeEditIncreaseEvent());

    expect(response.status).toBe(200);

    // No refund should be issued — this is a no-op early return
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    // No DB transaction — nothing to write
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("malformed newItemsJson: skips item update but still clears pendingEdit and sets deltaPaymentIntentId", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());

    // Malformed JSON in metadata
    const event = makeEditIncreaseEvent();
    (event.data.object as Record<string, unknown>).metadata = {
      ...(event.data.object as Record<string, unknown>).metadata as Record<string, string>,
      newItemsJson: "NOT VALID JSON {{{{",
    };

    // Should NOT throw
    const response = await callWebhook(event);
    expect(response.status).toBe(200);

    // Transaction should still run (order totals updated)
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    const tx = (mockPrisma as Record<string, unknown>)._txMock as {
      order: { update: ReturnType<typeof vi.fn> };
      orderItem: { update: ReturnType<typeof vi.fn> };
    };
    // Order update still happened
    expect(tx.order.update).toHaveBeenCalledOnce();
    // Item update was skipped (pendingItems is null from parse failure)
    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it("processedWebhookEvent dedup: returns 200 early without entering the handler logic", async () => {
    // Simulate event already in processedWebhookEvent table
    mockPrisma.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: "evt_test_edit_123" });

    const response = await callWebhook(makeEditIncreaseEvent());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.duplicate).toBe(true);

    // Nothing else should have run
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});
