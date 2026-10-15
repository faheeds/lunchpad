import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  retrieve: vi.fn(),
  settle: vi.fn(),
  cancelAbandoned: vi.fn(),
}));

vi.mock("@/lib/mobile-bearer", () => ({
  requireMobileAuth: m.auth,
  options: () => new Response(null, { status: 204 }),
  jsonOk: (d: unknown) => Response.json(d, { status: 200 }),
  jsonErr: (msg: string, status = 400) => Response.json({ error: msg }, { status }),
}));
vi.mock("@/lib/db", () => ({ prisma: { order: { findUnique: m.findUnique, findMany: m.findMany } } }));
vi.mock("@/lib/payments/stripe", () => ({ stripe: { checkout: { sessions: { retrieve: m.retrieve } } } }));
vi.mock("@/lib/pending-orders", () => ({
  settlePendingOrder: m.settle,
  cancelAbandonedOrder: m.cancelAbandoned,
}));

import { POST, DELETE } from "@/app/api/mobile/native/orders/[orderId]/pending/route";

const ctx = { params: Promise.resolve({ orderId: "o1" }) };
const future = new Date(Date.now() + 3600_000);
const order = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  status: "PENDING",
  parentUserId: "p1",
  restaurantId: "r1",
  checkoutSessionId: "cs_1",
  deliveryDate: { cutoffAt: future },
  ...over,
});
const req = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ parentUserId: "p1", restaurantId: "r1" });
  m.findUnique.mockResolvedValue(order());
  m.findMany.mockResolvedValue([]);
});

describe("POST resume", () => {
  it("returns the checkout url while the session is open", async () => {
    m.retrieve.mockResolvedValue({ status: "open", payment_status: "unpaid", url: "https://stripe/x" });
    const res = await POST(req, ctx);
    expect(await res.json()).toEqual({ action: "checkout", checkoutUrl: "https://stripe/x" });
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("settles an expired session and reports expired", async () => {
    m.retrieve.mockResolvedValue({ status: "expired", payment_status: "unpaid", url: null });
    m.settle.mockResolvedValue("cancelled");
    expect(await (await POST(req, ctx)).json()).toEqual({ action: "expired" });
  });
  it("reports paid when the session was actually paid", async () => {
    m.retrieve.mockResolvedValue({ status: "complete", payment_status: "paid", url: null });
    m.settle.mockResolvedValue("paid");
    expect(await (await POST(req, ctx)).json()).toEqual({ action: "paid" });
  });
  it("refuses another parent's order", async () => {
    m.findUnique.mockResolvedValue(order({ parentUserId: "other" }));
    expect((await POST(req, ctx)).status).toBe(403);
  });
  it("expires instead of resuming after the cutoff", async () => {
    m.findUnique.mockResolvedValue(order({ deliveryDate: { cutoffAt: new Date(Date.now() - 1000) } }));
    m.settle.mockResolvedValue("cancelled");
    expect(await (await POST(req, ctx)).json()).toEqual({ action: "expired" });
    expect(m.retrieve).not.toHaveBeenCalled();
  });
});

describe("DELETE cancel", () => {
  it("expires the session then cancels, including batch siblings", async () => {
    m.settle.mockResolvedValue("cancelled");
    m.findMany.mockResolvedValue([{ id: "o2" }]);
    const res = await DELETE(req, ctx);
    expect(await res.json()).toEqual({ ok: true, action: "cancelled" });
    expect(m.settle).toHaveBeenCalledWith(expect.anything(), { expireOpen: true });
    expect(m.cancelAbandoned).toHaveBeenCalledWith("o2", "parent_cancelled_batch");
  });
  it("never cancels a payment that went through", async () => {
    m.settle.mockResolvedValue("paid");
    expect(await (await DELETE(req, ctx)).json()).toEqual({ ok: true, action: "paid" });
    expect(m.cancelAbandoned).not.toHaveBeenCalled();
  });
  it("409s when Stripe state is unknown", async () => {
    m.settle.mockResolvedValue("unknown");
    expect((await DELETE(req, ctx)).status).toBe(409);
  });
});
