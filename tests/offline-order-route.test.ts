import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ddFind: vi.fn(),
  restFind: vi.fn(),
  createOrder: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deliveryDate: { findUnique: m.ddFind },
    restaurant: { findUnique: m.restFind },
  },
}));
vi.mock("@/lib/orders", () => ({ createAdminOrder: m.createOrder }));
vi.mock("@/lib/email/offline-order", () => ({ sendOfflineOrderEmail: m.sendEmail }));

import { POST } from "@/app/api/checkout/offline-order/route";

const body = (over: Record<string, unknown> = {}) => ({
  parentName: "Sara Khan",
  parentEmail: "sara@example.com",
  schoolId: "s1",
  deliveryDateId: "d1",
  studentName: "Sara Khan",
  cartItems: [{ menuItemId: "m1", additions: [], removals: [] }],
  paymentMethod: "zelle",
  fulfillmentType: "PICKUP",
  customerPhone: "555-123-4567",
  ...over,
});
const req = (b: unknown) => new Request("http://x/api/checkout/offline-order", { method: "POST", body: JSON.stringify(b) });

const restaurant = (over: Record<string, unknown> = {}) => ({
  isActive: true,
  acceptCash: true,
  acceptZelle: true,
  zelleHandle: "pay@example.com",
  offlinePaymentInstructions: null,
  deliveryEnabled: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.ddFind.mockResolvedValue({ school: { restaurantId: "r1" } });
  m.restFind.mockResolvedValue(restaurant());
  m.createOrder.mockResolvedValue({ id: "o1", orderNumber: "SL-1", totalCents: 2500 });
  m.sendEmail.mockResolvedValue({ ok: true });
});

describe("POST /api/checkout/offline-order", () => {
  it("places a confirmed order and returns Zelle instructions", async () => {
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orderNumber).toBe("SL-1");
    expect(json.instructions[0]).toContain("pay@example.com");
    const args = m.createOrder.mock.calls[0][0];
    expect(args.paymentMode).toEqual({ kind: "offline_pending", method: "zelle" });
    expect(args.enforceCutoff).toBe(true);
    expect(args.restaurantId).toBe("r1");
    expect(m.sendEmail).toHaveBeenCalledWith("o1", "r1");
  });

  it("rejects a payment method the restaurant hasn't enabled", async () => {
    m.restFind.mockResolvedValue(restaurant({ acceptZelle: false }));
    const res = await POST(req(body()));
    expect(res.status).toBe(400);
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("rejects delivery when the restaurant doesn't offer it", async () => {
    const res = await POST(req(body({ fulfillmentType: "DELIVERY", deliveryAddress: "123 Main St, Bellevue" })));
    expect(res.status).toBe(400);
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("requires a real address for delivery", async () => {
    m.restFind.mockResolvedValue(restaurant({ deliveryEnabled: true }));
    const res = await POST(req(body({ fulfillmentType: "DELIVERY", deliveryAddress: "home" })));
    expect(res.status).toBe(400);
  });

  it("passes delivery details through when delivery is allowed", async () => {
    m.restFind.mockResolvedValue(restaurant({ deliveryEnabled: true }));
    const res = await POST(req(body({ fulfillmentType: "DELIVERY", deliveryAddress: "123 Main St, Bellevue WA", paymentMethod: "cash" })));
    expect(res.status).toBe(200);
    expect(m.createOrder.mock.calls[0][0].fulfillment).toMatchObject({
      fulfillmentType: "DELIVERY",
      deliveryAddress: "123 Main St, Bellevue WA",
    });
  });

  it("requires a phone number", async () => {
    const res = await POST(req(body({ customerPhone: "" })));
    expect(res.status).toBe(400);
  });

  it("refuses when the restaurant is inactive", async () => {
    m.restFind.mockResolvedValue(restaurant({ isActive: false }));
    const res = await POST(req(body()));
    expect(res.status).toBe(503);
  });

  it("still succeeds if the confirmation email fails to send", async () => {
    m.sendEmail.mockResolvedValue({ ok: false });
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
  });
});
