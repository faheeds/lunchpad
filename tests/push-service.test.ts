import { beforeEach, describe, expect, it, vi } from "vitest";

// All mocks hoisted so vi.mock() factories can reference them.
const {
  findManyTokensMock,
  deleteManyTokensMock,
  findUniqueOrderMock,
} = vi.hoisted(() => ({
  findManyTokensMock: vi.fn(),
  deleteManyTokensMock: vi.fn(),
  findUniqueOrderMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pushToken: {
      findMany: findManyTokensMock,
      deleteMany: deleteManyTokensMock,
    },
    order: {
      findUnique: findUniqueOrderMock,
    },
  },
}));

import { sendPushToParent, sendPushForOrder } from "@/lib/push/service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPO_URL = "https://exp.host/--/exponent/api/v2/push/send";
const PAYLOAD = { title: "Test", body: "Test body" };

function makeToken(n: number) {
  return `ExponentPushToken[token-${n}]`;
}

function tokenRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({ token: makeToken(i) }));
}

function expoSuccess(tokens: { token: string }[]) {
  return {
    data: tokens.map(() => ({ status: "ok" })),
  };
}

function mockFetchOk(body: object) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200 })
  );
}

// ---------------------------------------------------------------------------
// sendPushToParent
// ---------------------------------------------------------------------------

describe("sendPushToParent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteManyTokensMock.mockResolvedValue({ count: 0 });
  });

  // 1. No tokens registered → returns early, never calls fetch
  it("no tokens registered → returns early without calling fetch", async () => {
    findManyTokensMock.mockResolvedValue([]);
    global.fetch = vi.fn();

    await sendPushToParent("parent-1", PAYLOAD);

    expect(fetch).not.toHaveBeenCalled();
    expect(deleteManyTokensMock).not.toHaveBeenCalled();
  });

  // 2. Single token, success ticket → fetch called once, no pruning
  it("single token, Expo returns success ticket → fetch called once, no pruning", async () => {
    const tokens = tokenRows(1);
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk(expoSuccess(tokens));

    await sendPushToParent("parent-1", PAYLOAD);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      EXPO_URL,
      expect.objectContaining({ method: "POST" })
    );
    expect(deleteManyTokensMock).not.toHaveBeenCalled();
  });

  // 3. Single token, DeviceNotRegistered → token pruned
  it("single token, Expo returns DeviceNotRegistered → token deleted", async () => {
    const tokens = tokenRows(1);
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk({
      data: [{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }],
    });

    await sendPushToParent("parent-1", PAYLOAD);

    expect(deleteManyTokensMock).toHaveBeenCalledOnce();
    expect(deleteManyTokensMock).toHaveBeenCalledWith({
      where: { token: { in: [makeToken(0)] } },
    });
  });

  // 4. Single token, other error ticket → console.error logged, token NOT pruned
  it("single token, Expo returns other error → console.error called, no pruning", async () => {
    const tokens = tokenRows(1);
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk({
      data: [{ status: "error", message: "MessageRateExceeded", details: { error: "MessageRateExceeded" } }],
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendPushToParent("parent-1", PAYLOAD);

    expect(spy).toHaveBeenCalledWith("[push] Expo error:", "MessageRateExceeded");
    expect(deleteManyTokensMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // 5. Expo returns top-level errors array → throws
  it("Expo returns top-level errors array → throws", async () => {
    const tokens = tokenRows(1);
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk({
      errors: [{ code: "PUSH_TOO_MANY_EXPERIENCE_IDS", message: "Too many experience IDs" }],
    });

    await expect(sendPushToParent("parent-1", PAYLOAD)).rejects.toThrow(
      "[push] Expo top-level error: Too many experience IDs"
    );
  });

  // 6. Expo returns non-2xx HTTP → throws
  it("Expo returns non-2xx HTTP status → throws", async () => {
    const tokens = tokenRows(1);
    findManyTokensMock.mockResolvedValue(tokens);
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 })
    );

    await expect(sendPushToParent("parent-1", PAYLOAD)).rejects.toThrow(
      "Expo push failed: 500"
    );
    expect(deleteManyTokensMock).not.toHaveBeenCalled();
  });

  // 7. 101 tokens → fetch called twice (batch boundary at 100)
  it("101 tokens → fetch called exactly twice (batch size 100)", async () => {
    const tokens = tokenRows(101);
    findManyTokensMock.mockResolvedValue(tokens);

    // First batch: 100 tokens. Second batch: 1 token.
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(expoSuccess(tokens.slice(0, 100))), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(expoSuccess(tokens.slice(100))), { status: 200 }));

    await sendPushToParent("parent-1", PAYLOAD);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(deleteManyTokensMock).not.toHaveBeenCalled();
  });

  // 8. Mixed batch: one DeviceNotRegistered + one other error → only dead token pruned
  it("mixed batch: DeviceNotRegistered + other error → only dead token pruned", async () => {
    const tokens = [
      { token: makeToken(0) }, // will be DeviceNotRegistered
      { token: makeToken(1) }, // will be MessageRateExceeded
    ];
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk({
      data: [
        { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "rate exceeded", details: { error: "MessageRateExceeded" } },
      ],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await sendPushToParent("parent-1", PAYLOAD);

    // Only the first token (index 0) should be pruned
    expect(deleteManyTokensMock).toHaveBeenCalledOnce();
    expect(deleteManyTokensMock).toHaveBeenCalledWith({
      where: { token: { in: [makeToken(0)] } },
    });
  });

  // Adversarial: payload data field passed through to Expo
  it("payload.data is included in Expo messages when provided", async () => {
    const tokens = tokenRows(1);
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk(expoSuccess(tokens));

    await sendPushToParent("parent-1", { title: "T", body: "B", data: { orderId: "ord-1" } });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body[0].data).toEqual({ orderId: "ord-1" });
  });

  // Adversarial: Expo returns empty data array (all tokens somehow unrecognized at API level)
  it("Expo returns empty data array → no pruning, no error", async () => {
    const tokens = tokenRows(2);
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk({ data: [] });

    await expect(sendPushToParent("parent-1", PAYLOAD)).resolves.toBeUndefined();
    expect(deleteManyTokensMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendPushForOrder
// ---------------------------------------------------------------------------

describe("sendPushForOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteManyTokensMock.mockResolvedValue({ count: 0 });
  });

  // 9. Order not found → returns early, sendPushToParent (fetch) never called
  it("order not found → returns early without calling Expo", async () => {
    findUniqueOrderMock.mockResolvedValue(null);
    global.fetch = vi.fn();

    await sendPushForOrder("order-missing", PAYLOAD);

    expect(findUniqueOrderMock).toHaveBeenCalledWith({
      where: { id: "order-missing" },
      select: { parentUserId: true },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  // 10. Order found with parentUserId → delegates to sendPushToParent
  it("order found with parentUserId → fetches tokens and calls Expo", async () => {
    findUniqueOrderMock.mockResolvedValue({ parentUserId: "parent-99" });
    const tokens = tokenRows(1);
    findManyTokensMock.mockResolvedValue(tokens);
    mockFetchOk(expoSuccess(tokens));

    await sendPushForOrder("order-1", PAYLOAD);

    expect(findManyTokensMock).toHaveBeenCalledWith({
      where: { parentUserId: "parent-99" },
      select: { token: true },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // Adversarial: order has null parentUserId (e.g. guest checkout edge case)
  it("order exists but parentUserId is null → returns early without calling Expo", async () => {
    findUniqueOrderMock.mockResolvedValue({ parentUserId: null });
    global.fetch = vi.fn();

    await sendPushForOrder("order-guest", PAYLOAD);

    expect(fetch).not.toHaveBeenCalled();
  });
});
