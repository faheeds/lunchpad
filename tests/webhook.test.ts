import { describe, expect, it } from "vitest";
import { isDuplicateWebhookEvent, shouldSendConfirmation } from "@/lib/payments/webhook";

describe("webhook idempotency helpers", () => {
  it("detects duplicate webhook ids", () => {
    expect(isDuplicateWebhookEvent("evt_123", "evt_123")).toBe(true);
    expect(isDuplicateWebhookEvent("evt_123", "evt_456")).toBe(false);
  });

  it("keeps valid orders even if confirmation email has not been sent yet", () => {
    expect(shouldSendConfirmation(true, null)).toBe(true);
    expect(shouldSendConfirmation(true, new Date())).toBe(false);
    expect(shouldSendConfirmation(false, null)).toBe(true);
  });
});
