/**
 * QA: Order modification — Case A (decrease)
 *
 * Covers updateOrderBeforeCutoff and updateOrderAsAdmin for price decreases:
 * Stripe refund issued first, then DB updated (Stripe-before-DB ordering).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks — must run before any module imports ───────────────────────
const { mockPrisma, mockStripe, mockLogActivity, mockCreateOrderEditCheckout } = vi.hoisted(() => {
  const mockStripe = {
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    coupons: { create: vi.fn() },
  };
  const mockPrisma = {
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: { update: vi.fn() },
    student: { update: vi.fn() },
    payment: { update: vi.fn(), updateMany: vi.fn() },
    processedWebhookEvent: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  const mockLogActivity = vi.fn();
  const mockCreateOrderEditCheckout = vi.fn();
  return { mockPrisma, mockStripe, mockLogActivity, mockCreateOrderEditCheckout };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/payments/stripe", () => ({ stripe: mockStripe }));
vi.mock("@/lib/activity", () => ({ logActivity: mockLogActivity }));
vi.mock("@/lib/payments/checkout", () => ({
  createOrderEditCheckoutSession: mockCreateOrderEditCheckout,
  createStripeCheckoutSession: vi.fn(),
  createWeeklyStripeCheckoutSession: vi.fn(),
}));

// Import under test AFTER mocks are established
import { updateOrderBeforeCutoff, updateOrderAsAdmin } from "@/lib/orders";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const FUTURE_CUTOFF = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now
const PAST_CUTOFF = new Date(Date.now() - 60 * 1000); // 1 minute ago
const DELIVERY_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000);

/** Order where Extra Cheese is currently on (totalCents = 700). Removing it → 500. */
function makeDecreaseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SL-001",
    restaurantId: "rest-1",
    parentUserId: "parent-1",
    studentId: "student-1",
    parentEmail: "parent@example.com",
    status: "PAID",
    totalCents: 700,
    subtotalCents: 700,
    paymentIntentId: "pi_original_abc",
    refundAmountCents: 0,
    pendingEditCheckoutSession: null,
    pendingEditTotalCents: null,
    pendingEditCreatedAt: null,
    deltaPaymentIntentId: null,
    deltaAmountCents: null,
    specialInstructions: null,
    school: { timezone: "America/Los_Angeles" },
    deliveryDate: { cutoffAt: FUTURE_CUTOFF, deliveryDate: DELIVERY_DATE },
    items: [
      {
        id: "item-1",
        basePriceCents: 500,
        additions: ["Extra Cheese"],
        removals: [],
        allergyNotes: null,
        dietaryNotes: null,
        specialInstructions: null,
        lineTotalCents: 700,
        menuItem: {
          id: "menu-1",
          options: [
            { id: "opt-1", name: "Extra Cheese", optionType: "ADD_ON", priceDeltaCents: 200 },
            { id: "opt-2", name: "No Onions", optionType: "REMOVAL", priceDeltaCents: 0 },
          ],
        },
      },
    ],
    student: { id: "student-1" },
    payment: { id: "pay-1", amountCents: 700, providerPaymentIntent: "pi_original_abc", status: "PAID" },
    restaurant: { stripeAccountId: null },
    ...overrides,
  };
}

const UPDATED_ORDER = { id: "order-1", orderNumber: "SL-001", restaurantId: "rest-1" };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("updateOrderBeforeCutoff — Case A: decrease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_test_abc" });
    mockPrisma.orderItem.update.mockResolvedValue({});
    mockPrisma.student.update.mockResolvedValue({});
    mockPrisma.order.update.mockResolvedValue(UPDATED_ORDER);
  });

  it("issues Stripe refund with correct amount and idempotency key, then updates DB totals", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeDecreaseOrder());

    // Remove Extra Cheese → newTotal = 500 (down from 700)
    const result = await updateOrderBeforeCutoff({
      orderId: "order-1",
      parentUserId: "parent-1",
      additions: [],
      removals: [],
    });

    expect(result.action).toBe("updated");

    // Stripe refund: amount = 200, idempotency key = "edit-decrease-order-1-500"
    expect(mockStripe.refunds.create).toHaveBeenCalledOnce();
    const [refundParams, refundOpts] = mockStripe.refunds.create.mock.calls[0];
    expect(refundParams.payment_intent).toBe("pi_original_abc");
    expect(refundParams.amount).toBe(200);
    expect(refundOpts.idempotencyKey).toBe("edit-decrease-order-1-500");

    // Order update: totalCents and Payment.amountCents both = 500
    expect(mockPrisma.order.update).toHaveBeenCalledOnce();
    const orderUpdateData = mockPrisma.order.update.mock.calls[0][0].data;
    expect(orderUpdateData.totalCents).toBe(500);
    expect(orderUpdateData.subtotalCents).toBe(500);
    expect(orderUpdateData.payment.update.amountCents).toBe(500);
  });

  it("Stripe-before-DB ordering: if Stripe refund throws, DB is NOT updated", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeDecreaseOrder());
    mockStripe.refunds.create.mockRejectedValue(new Error("Stripe card_declined"));

    await expect(
      updateOrderBeforeCutoff({ orderId: "order-1", parentUserId: "parent-1", additions: [], removals: [] })
    ).rejects.toThrow("Stripe card_declined");

    // No DB writes should have happened
    expect(mockPrisma.orderItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it("throws 'Only paid orders can be modified' for CANCELLED order", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeDecreaseOrder({ status: "CANCELLED" }));

    await expect(
      updateOrderBeforeCutoff({ orderId: "order-1", parentUserId: "parent-1", additions: [], removals: [] })
    ).rejects.toThrow("Only paid orders can be modified");

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("throws cutoff error when ordering is past cutoff", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(
      makeDecreaseOrder({
        deliveryDate: { cutoffAt: PAST_CUTOFF, deliveryDate: DELIVERY_DATE },
      })
    );

    await expect(
      updateOrderBeforeCutoff({ orderId: "order-1", parentUserId: "parent-1", additions: [], removals: [] })
    ).rejects.toThrow(/Ordering closed/);

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("throws 'One or more add-ons are invalid' for an unknown add-on", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeDecreaseOrder());

    await expect(
      updateOrderBeforeCutoff({
        orderId: "order-1",
        parentUserId: "parent-1",
        additions: ["Truffle Shavings"], // not in menu options
        removals: [],
      })
    ).rejects.toThrow("One or more add-ons are invalid");

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("throws 'Order not found' when parentUserId does not match (cross-tenant)", async () => {
    // findFirst returns null because WHERE parentUserId filter rejects it
    mockPrisma.order.findFirst.mockResolvedValue(null);

    await expect(
      updateOrderBeforeCutoff({
        orderId: "order-1",
        parentUserId: "different-parent",
        additions: [],
        removals: [],
      })
    ).rejects.toThrow("Order not found");

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("uses order.payment.providerPaymentIntent as fallback when paymentIntentId is null", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(
      makeDecreaseOrder({ paymentIntentId: null }) // force fallback to payment.providerPaymentIntent
    );

    await updateOrderBeforeCutoff({
      orderId: "order-1",
      parentUserId: "parent-1",
      additions: [],
      removals: [],
    });

    const [refundParams] = mockStripe.refunds.create.mock.calls[0];
    expect(refundParams.payment_intent).toBe("pi_original_abc"); // from payment.providerPaymentIntent
  });
});

describe("updateOrderAsAdmin — Case A: decrease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockStripe.refunds.create.mockResolvedValue({ id: "re_admin_abc" });
    mockPrisma.orderItem.update.mockResolvedValue({});
    mockPrisma.student.update.mockResolvedValue({});
    mockPrisma.order.update.mockResolvedValue(UPDATED_ORDER);
  });

  it("issues Stripe refund and updates DB totals, logging admin attribution", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeDecreaseOrder());

    const result = await updateOrderAsAdmin({
      orderId: "order-1",
      restaurantId: "rest-1",
      adminUserId: "admin-1",
      additions: [],
      removals: [],
    });

    expect(result.action).toBe("updated");
    expect(mockStripe.refunds.create).toHaveBeenCalledOnce();

    const [refundParams, opts] = mockStripe.refunds.create.mock.calls[0];
    expect(refundParams.payment_intent).toBe("pi_original_abc");
    expect(refundParams.amount).toBe(200);
    expect(opts.idempotencyKey).toBe("edit-decrease-order-1-500");

    // Admin ID should appear in refund metadata
    expect(refundParams.metadata?.adminUserId).toBe("admin-1");
  });

  it("bypasses cutoff gate — past-cutoff order still gets refunded", async () => {
    // Admin path does not call assertOrderingOpen
    mockPrisma.order.findFirst.mockResolvedValue(
      makeDecreaseOrder({
        deliveryDate: { cutoffAt: PAST_CUTOFF, deliveryDate: DELIVERY_DATE },
      })
    );

    // Should NOT throw even though cutoff has passed
    await expect(
      updateOrderAsAdmin({
        orderId: "order-1",
        restaurantId: "rest-1",
        additions: [],
        removals: [],
      })
    ).resolves.toMatchObject({ action: "updated" });

    expect(mockStripe.refunds.create).toHaveBeenCalledOnce();
  });

  it("throws 'Order not found' if restaurantId does not match (cross-tenant)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null); // WHERE restaurantId filter rejects it

    await expect(
      updateOrderAsAdmin({
        orderId: "order-1",
        restaurantId: "different-rest",
        additions: [],
        removals: [],
      })
    ).rejects.toThrow("Order not found");
  });
});
