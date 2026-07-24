import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { findFirstMock, emailLogCreateMock, orderUpdateMock, transactionMock, sendEmailMock } =
  vi.hoisted(() => ({
    findFirstMock: vi.fn(),
    emailLogCreateMock: vi.fn(),
    orderUpdateMock: vi.fn(),
    transactionMock: vi.fn(),
    sendEmailMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findFirst: findFirstMock, update: orderUpdateMock },
    emailLog: { create: emailLogCreateMock },
    $transaction: transactionMock,
  },
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendEmailMock },
  })),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ROOT_DOMAIN: "example.com",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "noreply@example.com",
    EMAIL_FROM_NAME: null,
    NEXTAUTH_SECRET: "test-secret-for-hmac-minimum32chars!!",
  },
}));

import { buildConfirmationEmail } from "@/lib/email/templates";
import { signOrderCancelToken, verifyOrderCancelToken } from "@/lib/order-tokens";
import { sendOrderConfirmationEmail } from "@/lib/email/service";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_ARGS = {
  parentName: "Jane Doe",
  studentName: "Alex Doe",
  deliveryDate: new Date("2026-09-15T11:00:00Z"),
  timezone: "America/New_York",
  items: [{ itemName: "Grilled Cheese", additions: [], removals: [] }],
  amountCents: 895,
  orderNumber: "LUN-001",
  restaurantName: "FS Kitchen",
};

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-abc123",
    orderNumber: "LUN-001",
    parentName: "Jane Doe",
    parentEmail: "jane@example.com",
    totalCents: 895,
    status: "PAID",
    confirmationSentAt: null,
    restaurant: {
      name: "FS Kitchen",
      slug: "fskitchen",
      logoUrl: null,
      primaryColor: null,
      contactEmail: null,
      contactPhone: null,
    },
    school: { timezone: "America/New_York" },
    deliveryDate: { deliveryDate: new Date("2026-09-15T11:00:00Z") },
    student: { studentName: "Alex Doe", allergyNotes: null },
    items: [
      {
        itemNameSnapshot: "Grilled Cheese",
        additions: [],
        removals: [],
        allergyNotes: null,
      },
    ],
    ...overrides,
  };
}

// ── Group 1: buildConfirmationEmail ──────────────────────────────────────────

describe("buildConfirmationEmail — guestCancelUrl", () => {
  it("includes URL and button in HTML when guestCancelUrl is set", () => {
    const url = "https://fskitchen.example.com/checkout/success?order=order-abc123";
    const { html, text } = buildConfirmationEmail({ ...BASE_ARGS, guestCancelUrl: url });
    expect(html).toContain(url);
    expect(html).toContain("Manage your order");
    expect(text).toContain("Manage your order:");
    expect(text).toContain(url);
  });

  it("includes instructional caption in HTML alongside button", () => {
    const url = "https://fskitchen.example.com/checkout/success?order=order-abc123";
    const { html } = buildConfirmationEmail({ ...BASE_ARGS, guestCancelUrl: url });
    expect(html).toContain("cancel");
  });

  it("omits button from HTML when guestCancelUrl is null", () => {
    const { html, text } = buildConfirmationEmail({ ...BASE_ARGS, guestCancelUrl: null });
    expect(html).not.toContain("Manage your order");
    expect(text).not.toContain("Manage your order");
  });

  it("omits button when guestCancelUrl is not provided", () => {
    const { html, text } = buildConfirmationEmail({ ...BASE_ARGS });
    expect(html).not.toContain("Manage your order");
    expect(text).not.toContain("Manage your order");
  });

  it("adversarial: empty string guestCancelUrl → no button rendered", () => {
    const { html, text } = buildConfirmationEmail({ ...BASE_ARGS, guestCancelUrl: "" });
    expect(html).not.toContain("Manage your order");
    expect(text).not.toContain("Manage your order");
  });
});

// ── Group 2: order-tokens ─────────────────────────────────────────────────────

describe("signOrderCancelToken / verifyOrderCancelToken", () => {
  it("happy path: sign then verify with matching orderId → true", () => {
    const token = signOrderCancelToken("order-abc");
    expect(verifyOrderCancelToken(token, "order-abc")).toBe(true);
  });

  it("wrong orderId: verify with different orderId → false", () => {
    const token = signOrderCancelToken("order-abc");
    expect(verifyOrderCancelToken(token, "order-xyz")).toBe(false);
  });

  it("tampered signature: replacing sig part → false", () => {
    const token = signOrderCancelToken("order-abc");
    const payloadPart = token.split(".")[0];
    expect(verifyOrderCancelToken(`${payloadPart}.invalidsignatureXXX`, "order-abc")).toBe(false);
  });

  it("empty token → false", () => {
    expect(verifyOrderCancelToken("", "order-abc")).toBe(false);
  });

  it("adversarial: expired token (negative TTL) → false", () => {
    const expiredToken = signOrderCancelToken("order-abc", -1);
    expect(verifyOrderCancelToken(expiredToken, "order-abc")).toBe(false);
  });

  it("adversarial: tampered payload (wrong orderId in payload) → false", () => {
    const token = signOrderCancelToken("order-abc");
    const parts = token.split(".");
    // decode payload, swap orderId, re-encode without re-signing
    const decoded = Buffer.from(parts[0], "base64url").toString();
    const tampered = decoded.replace("order-abc", "order-evil");
    const tamperedToken = `${Buffer.from(tampered).toString("base64url")}.${parts[1]}`;
    expect(verifyOrderCancelToken(tamperedToken, "order-abc")).toBe(false);
  });
});

// ── Group 3: sendOrderConfirmationEmail ───────────────────────────────────────

describe("sendOrderConfirmationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ data: { id: "resend-id-1" }, error: null });
    transactionMock.mockResolvedValue([{}, {}]);
    emailLogCreateMock.mockResolvedValue({});
    orderUpdateMock.mockResolvedValue({});
  });

  it("sends email HTML containing orderId in a URL and 'Manage your order'", async () => {
    findFirstMock.mockResolvedValue(makeOrder());

    await sendOrderConfirmationEmail("order-abc123", "rest-1");

    expect(sendEmailMock).toHaveBeenCalledOnce();
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("order-abc123");
    expect(html).toContain("Manage your order");
    expect(html).toContain("checkout/success");
  });

  it("cancel URL uses restaurant slug and ROOT_DOMAIN", async () => {
    findFirstMock.mockResolvedValue(makeOrder());

    await sendOrderConfirmationEmail("order-abc123", "rest-1");

    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("fskitchen.example.com");
  });

  it("adversarial: order not found → throws, no email sent", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(sendOrderConfirmationEmail("no-such-order", "rest-1")).rejects.toThrow(
      "Order not found"
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("adversarial: findFirst is scoped to both orderId and restaurantId", async () => {
    findFirstMock.mockResolvedValue(makeOrder());

    await sendOrderConfirmationEmail("order-abc123", "rest-1");

    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "order-abc123",
          restaurantId: "rest-1",
        }),
      })
    );
  });
});
