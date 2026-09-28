import { beforeEach, describe, expect, it, vi } from "vitest";

// A raw Stripe error (e.g. from an expired/revoked secret key) must never
// reach a customer-facing response -- it was showing up verbatim in an
// alert dialog on a customer's phone, including a fragment of the actual
// secret key ("Expired API Key provided: sk_live_...1iCU3t"). This test
// simulates that failure mode and asserts the customer-facing error is
// generic while nothing Stripe-specific leaks through.
const { checkoutSessionsCreateMock, couponsCreateMock } = vi.hoisted(() => ({
  checkoutSessionsCreateMock: vi.fn(),
  couponsCreateMock: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: checkoutSessionsCreateMock } },
    coupons: { create: couponsCreateMock },
  },
}));

import { createStripeCheckoutSession } from "@/lib/payments/checkout";

const BASE_ARGS = {
  orderId: "order-123",
  orderNumber: "SL-20260928-1234",
  parentEmail: "parent@example.com",
  lineItems: [{ name: "Lunch", description: "Order SL-20260928-1234", amountCents: 1000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkout error sanitization", () => {
  it("never forwards a raw Stripe error (or a key fragment) to the caller", async () => {
    checkoutSessionsCreateMock.mockRejectedValue(
      new Error(
        "Expired API Key provided: sk_live_****************************************************************1iCU3t"
      )
    );

    await expect(createStripeCheckoutSession(BASE_ARGS)).rejects.toThrow();

    let caught: Error | undefined;
    try {
      await createStripeCheckoutSession(BASE_ARGS);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).not.toMatch(/sk_live/);
    expect(caught!.message).not.toMatch(/API Key/i);
    expect(caught!.message).toMatch(/couldn't start checkout/i);
  });

  it("sanitizes a coupon-creation failure the same way", async () => {
    couponsCreateMock.mockRejectedValue(new Error("Expired API Key provided: sk_live_abc123"));

    let caught: Error | undefined;
    try {
      await createStripeCheckoutSession({
        ...BASE_ARGS,
        discountCents: 500,
        discountLabel: "Welcome offer",
      });
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).not.toMatch(/sk_live/);
    expect(caught!.message).toMatch(/couldn't start checkout/i);
    expect(checkoutSessionsCreateMock).not.toHaveBeenCalled();
  });

  it("passes through the real session on success (no regression on the happy path)", async () => {
    checkoutSessionsCreateMock.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/cs_test_123" });

    const session = await createStripeCheckoutSession(BASE_ARGS);

    expect(session).toEqual({ id: "cs_test_123", url: "https://checkout.stripe.com/cs_test_123" });
    expect(checkoutSessionsCreateMock).toHaveBeenCalledTimes(1);
  });
});
