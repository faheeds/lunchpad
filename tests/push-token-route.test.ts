import { beforeEach, describe, expect, it, vi } from "vitest";

// All mocks hoisted so vi.mock() factories can reference them.
const {
  requireMobileAuthMock,
  upsertMock,
  deleteManyMock,
} = vi.hoisted(() => ({
  requireMobileAuthMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

vi.mock("@/lib/mobile-bearer", () => ({
  requireMobileAuth: requireMobileAuthMock,
  options: () => new Response(null, { status: 204 }),
  jsonOk: (data: unknown) => Response.json(data, { status: 200 }),
  jsonErr: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pushToken: {
      upsert: upsertMock,
      deleteMany: deleteManyMock,
    },
  },
}));

import { POST, DELETE } from "@/app/api/mobile/native/push-token/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_AUTH = {
  parentUserId: "parent-1",
  restaurantId: "rest-1",
};

const VALID_TOKEN = "ExponentPushToken[abc123]";

function makePostRequest(body: object) {
  return new Request("http://localhost/api/mobile/native/push-token", {
    method: "POST",
    headers: {
      Authorization: "Bearer fake-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(body: object) {
  return new Request("http://localhost/api/mobile/native/push-token", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer fake-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// POST /api/mobile/native/push-token
// ---------------------------------------------------------------------------

describe("POST /api/mobile/native/push-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    upsertMock.mockResolvedValue({ id: "pt-1" });
  });

  // 11. Valid token + platform → 200 { ok: true }, upsert called
  it("valid token + platform 'ios' → 200 { ok: true } and upsert called", async () => {
    const res = await POST(makePostRequest({ token: VALID_TOKEN, platform: "ios" }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentUserId_token: { parentUserId: "parent-1", token: VALID_TOKEN } },
        create: expect.objectContaining({
          parentUserId: "parent-1",
          token: VALID_TOKEN,
          platform: "ios",
        }),
      })
    );
  });

  it("valid token + platform 'android' → 200 { ok: true }", async () => {
    const res = await POST(makePostRequest({ token: VALID_TOKEN, platform: "android" }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  // 12. Missing token field → 400
  it("missing token field → 400 'token is required'", async () => {
    const res = await POST(makePostRequest({ platform: "ios" }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("token is required");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // 13. Invalid platform → 400
  it("platform 'web' (invalid) → 400 'platform must be ios or android'", async () => {
    const res = await POST(makePostRequest({ token: VALID_TOKEN, platform: "web" }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("platform must be ios or android");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("missing platform field → 400 'platform must be ios or android'", async () => {
    const res = await POST(makePostRequest({ token: VALID_TOKEN }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("platform must be ios or android");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // 14. No auth → 401
  it("no/invalid auth → 401", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 })
    );

    const res = await POST(makePostRequest({ token: VALID_TOKEN, platform: "ios" }) as never);

    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // 15. Duplicate registration (same parent + token) → 200, upsert is idempotent
  it("duplicate registration (same parent + token) → 200 (upsert is idempotent)", async () => {
    // Upsert on duplicate simply updates updatedAt — simulate by returning existing row.
    upsertMock.mockResolvedValue({ id: "pt-existing" });

    const res = await POST(makePostRequest({ token: VALID_TOKEN, platform: "ios" }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  // Adversarial: empty string token → 400 (treated as missing)
  it("adversarial: empty string token → 400 'token is required'", async () => {
    const res = await POST(makePostRequest({ token: "", platform: "ios" }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("token is required");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // Adversarial: platform with wrong casing → 400
  it("adversarial: platform 'iOS' (wrong casing) → 400 'platform must be ios or android'", async () => {
    const res = await POST(makePostRequest({ token: VALID_TOKEN, platform: "iOS" }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("platform must be ios or android");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/mobile/native/push-token
// ---------------------------------------------------------------------------

describe("DELETE /api/mobile/native/push-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    deleteManyMock.mockResolvedValue({ count: 1 });
  });

  // 16. Token exists → 200 { ok: true }
  it("token exists for this parent → 200 { ok: true }", async () => {
    const res = await DELETE(makeDeleteRequest({ token: VALID_TOKEN }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deleteManyMock).toHaveBeenCalledOnce();
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { parentUserId: "parent-1", token: VALID_TOKEN },
    });
  });

  // 17. Token doesn't exist → still 200 (idempotent)
  it("token not found (count=0) → still 200 { ok: true } (idempotent)", async () => {
    deleteManyMock.mockResolvedValue({ count: 0 });

    const res = await DELETE(makeDeleteRequest({ token: VALID_TOKEN }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  // 18. Missing token field → 400
  it("missing token field → 400 'token is required'", async () => {
    const res = await DELETE(makeDeleteRequest({}) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("token is required");
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  // 19. No auth → 401
  it("no/invalid auth → 401", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 })
    );

    const res = await DELETE(makeDeleteRequest({ token: VALID_TOKEN }) as never);

    expect(res.status).toBe(401);
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  // Adversarial: deleteMany scoped to parentUserId (cross-tenant cannot delete another parent's token)
  it("adversarial: deleteMany always scoped to authenticated parentUserId (cross-tenant safe)", async () => {
    const res = await DELETE(
      makeDeleteRequest({ token: "ExponentPushToken[someone-elses-token]" }) as never
    );

    expect(res.status).toBe(200);
    // Verify the where clause always includes the authenticated parentUserId
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { parentUserId: "parent-1", token: "ExponentPushToken[someone-elses-token]" },
    });
  });

  // Adversarial: empty string token → 400 (treated as missing)
  it("adversarial: empty string token → 400 'token is required'", async () => {
    const res = await DELETE(makeDeleteRequest({ token: "" }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("token is required");
    expect(deleteManyMock).not.toHaveBeenCalled();
  });
});
