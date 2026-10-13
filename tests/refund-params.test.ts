import { beforeEach, describe, expect, it, vi } from "vitest";

const retrieve = vi.fn();
const create = vi.fn();
vi.mock("@/lib/payments/stripe", () => ({
  stripe: { paymentIntents: { retrieve: (...a: unknown[]) => retrieve(...a) }, refunds: { create: (...a: unknown[]) => create(...a) } },
}));
vi.mock("@/lib/log", () => ({ logWarn: vi.fn() }));

import { createRefund } from "@/lib/payments/refund-params";

describe("createRefund", () => {
  beforeEach(() => {
    retrieve.mockReset();
    create.mockReset().mockResolvedValue({ id: "re_1" });
  });

  it("reverses the transfer for destination charges", async () => {
    retrieve.mockResolvedValue({ transfer_data: { destination: "acct_1" } });
    await createRefund({ payment_intent: "pi_1", amount: 500 }, { idempotencyKey: "k" });
    expect(create).toHaveBeenCalledWith({ payment_intent: "pi_1", amount: 500, reverse_transfer: true }, { idempotencyKey: "k" });
  });

  it("leaves platform-only charges untouched", async () => {
    retrieve.mockResolvedValue({ transfer_data: null });
    await createRefund({ payment_intent: "pi_2" });
    expect(create).toHaveBeenCalledWith({ payment_intent: "pi_2" }, undefined);
  });

  it("still refunds if the lookup fails", async () => {
    retrieve.mockRejectedValue(new Error("boom"));
    await createRefund({ payment_intent: "pi_3" });
    expect(create).toHaveBeenCalledWith({ payment_intent: "pi_3" }, undefined);
  });
});
