/**
 * QA: Order modification — Case B/C (increase)
 *
 * Customer path: returns checkout_required with a delta Stripe Checkout URL.
 * Admin path: stripe_link (same as customer), manual (immediate, no Stripe),
 *             comped/default (immediate, no Stripe).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
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

import { updateOrderBeforeCutoff, updateOrderAsAdmin } from "@/lib/orders";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TWO_HOURS = 2 * 60 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;
const FUTURE_CUTOFF_2H = new Date(Date.now() + TWO_HOURS);
const CUTOFF_25MIN = new Date(Date.now() + 25 * 60 * 1000); // <30 min away
const PAST_CUTOFF = new Date(Date.now() - 60 * 1000);
const DELIVERY_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000);

const MOCK_SESSION = { id: "cs_delta_123", url: "https://checkout.stripe.com/pay/cs_delta_123" };

/** Order with NO add-ons (base price only). Adding Extra Cheese → increase. */
function makeBaseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "SL-001",
    restaurantId: "rest-1",
    parentUserId: "parent-1",
    studentId: "student-1",
    parentEmail: "parent@example.com",
    status: "PAID",
    totalCents: 500,   // base only, no add-ons
    subtotalCents: 500,
    paymentIntentId: "pi_original_abc",
    refundAmountCents: 0,
    pendingEditCheckoutSession: null,
    pendingEditTotalCents: null,
    pendingEditCreatedAt: null,
    deltaPaymentIntentId: null,
    deltaAmountCents: null,
    specialInstructions: null,
    school: { timezone: "America/Los_Angeles" },
    deliveryDate: { cutoffAt: FUTURE_CUTOFF_2H, deliveryDate: DELIVERY_DATE },
    items: [
      {
        id: "item-1",
        basePriceCents: 500,
        additions: [],
        removals: [],
        allergyNotes: null,
        dietaryNotes: null,
        specialInstructions: null,
        lineTotalCents: 500,
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
    payment: { id: "pay-1", amountCents: 500, providerPaymentIntent: "pi_original_abc", status: "PAID" },
    restaurant: { stripeAccountId: null },
    ...overrides,
  };
}

const UPDATED_ORDER = { id: "order-1", orderNumber: "SL-001", restaurantId: "rest-1" };

// ── Customer path (updateOrderBeforeCutoff) ───────────────────────────────────

describe("updateOrderBeforeCutoff — Case B: increase (customer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockCreateOrderEditCheckout.mockResolvedValue(MOCK_SESSION);
    mockPrisma.order.update.mockResolvedValue(UPDATED_ORDER);
  });

  it("creates delta checkout session and writes pendingEdit fields; returns checkout_required", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeBaseOrder());

    // Add Extra Cheese → newTotal = 700, delta = +200
    const result = await updateOrderBeforeCutoff({
      orderId: "order-1",
      parentUserId: "parent-1",
      additions: ["Extra Cheese"],
      removals: [],
    });

    expect(result.action).toBe("checkout_required");
    expect((result as { action: "checkout_required"; checkoutUrl: string }).checkoutUrl).toBe(MOCK_SESSION.url);

    // Checkout session called with correct delta and metadata
    expect(mockCreateOrderEditCheckout).toHaveBeenCalledOnce();
    const [editSessionArgs] = mockCreateOrderEditCheckout.mock.calls[0];
    expect(editSessionArgs.orderId).toBe("order-1");
    expect(editSessionArgs.deltaCents).toBe(200);
    expect(editSessionArgs.newTotalCents).toBe(700);

    // expiresAt must be ≤ min(cutoffAt, now+24h-60s)
    const maxExpiry = Math.floor(
      Math.min(FUTURE_CUTOFF_2H.getTime(), Date.now() + 24 * 60 * 60 * 1000 - 60_000) / 1000
    );
    expect(editSessionArgs.expiresAt).toBeLessThanOrEqual(maxExpiry + 5); // 5s tolerance for execution time

    // pendingEdit* fields written to Order
    expect(mockPrisma.order.update).toHaveBeenCalledOnce();
    const updateData = mockPrisma.order.update.mock.calls[0][0].data;
    expect(updateData.pendingEditTotalCents).toBe(700);
    expect(updateData.pendingEditCheckoutSession).toBe(MOCK_SESSION.id);
    expect(updateData.pendingEditCreatedAt).toBeInstanceOf(Date);

    // Must NOT touch totalCents yet
    expect(updateData.totalCents).toBeUndefined();
    // Must NOT call Stripe refunds
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("throws 'Too close to cutoff' when <30 minutes remain before cutoff", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(
      makeBaseOrder({ deliveryDate: { cutoffAt: CUTOFF_25MIN, deliveryDate: DELIVERY_DATE } })
    );

    await expect(
      updateOrderBeforeCutoff({
        orderId: "order-1",
        parentUserId: "parent-1",
        additions: ["Extra Cheese"],
        removals: [],
      })
    ).rejects.toThrow("Too close to cutoff");

    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it("throws when pendingEditCheckoutSession is already set (one in-flight edit at a time)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(
      makeBaseOrder({ pendingEditCheckoutSession: "cs_already_inflight" })
    );

    await expect(
      updateOrderBeforeCutoff({
        orderId: "order-1",
        parentUserId: "parent-1",
        additions: ["Extra Cheese"],
        removals: [],
      })
    ).rejects.toThrow(/already have a pending edit/i);

    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();
  });

  it("throws when deltaPaymentIntentId is already set (one-increase-edit limit)", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(
      makeBaseOrder({ deltaPaymentIntentId: "pi_prior_delta" })
    );

    await expect(
      updateOrderBeforeCutoff({
        orderId: "order-1",
        parentUserId: "parent-1",
        additions: ["Extra Cheese"],
        removals: [],
      })
    ).rejects.toThrow(/increased once/i);

    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();
  });

  it("propagates assertOrderingOpen error when cutoff has passed; no session created", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(
      makeBaseOrder({ deliveryDate: { cutoffAt: PAST_CUTOFF, deliveryDate: DELIVERY_DATE } })
    );

    await expect(
      updateOrderBeforeCutoff({
        orderId: "order-1",
        parentUserId: "parent-1",
        additions: ["Extra Cheese"],
        removals: [],
      })
    ).rejects.toThrow(/Ordering closed/);

    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });
});

// ── Admin path (updateOrderAsAdmin) ──────────────────────────────────────────

describe("updateOrderAsAdmin — Case B/C: increase variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockCreateOrderEditCheckout.mockResolvedValue(MOCK_SESSION);
    mockPrisma.order.update.mockResolvedValue(UPDATED_ORDER);
    mockPrisma.orderItem.update.mockResolvedValue({});
    mockPrisma.student.update.mockResolvedValue({});
  });

  it("stripe_link mode: generates checkout session and writes pendingEdit fields", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeBaseOrder());

    const result = await updateOrderAsAdmin({
      orderId: "order-1",
      restaurantId: "rest-1",
      additions: ["Extra Cheese"],
      removals: [],
      adjustmentMode: { kind: "stripe_link" },
    });

    expect(result.action).toBe("checkout_required");
    expect(mockCreateOrderEditCheckout).toHaveBeenCalledOnce();

    const [editSessionArgs] = mockCreateOrderEditCheckout.mock.calls[0];
    expect(editSessionArgs.deltaCents).toBe(200);
    expect(editSessionArgs.newTotalCents).toBe(700);

    const updateData = mockPrisma.order.update.mock.calls[0][0].data;
    expect(updateData.pendingEditCheckoutSession).toBe(MOCK_SESSION.id);
    expect(updateData.pendingEditTotalCents).toBe(700);

    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });

  it("manual mode: applies increase immediately with no Stripe call; activity log mentions manual", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeBaseOrder());

    const result = await updateOrderAsAdmin({
      orderId: "order-1",
      restaurantId: "rest-1",
      additions: ["Extra Cheese"],
      removals: [],
      adjustmentMode: { kind: "manual", method: "cash", reference: "CASH-001" },
    });

    expect(result.action).toBe("updated");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();

    // DB updated immediately to new total
    const updateData = mockPrisma.order.update.mock.calls[0][0].data;
    expect(updateData.totalCents).toBe(700);
    expect(updateData.subtotalCents).toBe(700);

    // Activity log should mention the payment method (source uses adjustmentMode.method directly,
    // not the word "manual"). With method:"cash", log reads "increase recorded as cash".
    expect(mockLogActivity).toHaveBeenCalled();
    const logCall = mockLogActivity.mock.calls[0][0];
    expect(logCall.summary).toMatch(/increase recorded as cash/i);
  });

  it("comped mode (explicit): applies increase immediately, no Stripe call, activity notes comped", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeBaseOrder());

    const result = await updateOrderAsAdmin({
      orderId: "order-1",
      restaurantId: "rest-1",
      additions: ["Extra Cheese"],
      removals: [],
      adjustmentMode: { kind: "comped", reason: "loyalty" },
    });

    expect(result.action).toBe("updated");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();

    const updateData = mockPrisma.order.update.mock.calls[0][0].data;
    expect(updateData.totalCents).toBe(700);

    const logCall = mockLogActivity.mock.calls[0][0];
    expect(logCall.summary).toMatch(/comped/i);
  });

  it("default (no adjustmentMode): applies increase immediately — backwards-compat comped behavior", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeBaseOrder());

    // No adjustmentMode passed at all
    const result = await updateOrderAsAdmin({
      orderId: "order-1",
      restaurantId: "rest-1",
      additions: ["Extra Cheese"],
      removals: [],
    });

    expect(result.action).toBe("updated");
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();

    const updateData = mockPrisma.order.update.mock.calls[0][0].data;
    expect(updateData.totalCents).toBe(700);
  });

  it("stripe_link mode rejects <30 min to cutoff just like the customer path", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(
      makeBaseOrder({ deliveryDate: { cutoffAt: CUTOFF_25MIN, deliveryDate: DELIVERY_DATE } })
    );

    await expect(
      updateOrderAsAdmin({
        orderId: "order-1",
        restaurantId: "rest-1",
        additions: ["Extra Cheese"],
        removals: [],
        adjustmentMode: { kind: "stripe_link" },
      })
    ).rejects.toThrow("Too close to cutoff");

    expect(mockCreateOrderEditCheckout).not.toHaveBeenCalled();
  });
});
