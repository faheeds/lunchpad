/**
 * Server-action tests for app/admin/(protected)/settings/mfa/actions.ts.
 *
 * Scope: startEnrollment, confirmEnrollment, regenerateRecoveryCodes,
 * disableMfa. We exercise happy paths and — critically — every
 * adversarial branch: cross-tenant spoofing, malformed input, rate
 * limiting, OWNER short-circuit, in-transaction re-checks.
 *
 * Ground rules:
 *   - Real crypto (lib/mfa.ts). Determinism comes from vi.useFakeTimers()
 *     when we need a stable TOTP.
 *   - Real rate limiter (lib/mfa-server.ts) but reset between tests via
 *     vi.resetModules() so bucket state doesn't bleed. This gives cleaner
 *     coverage of the actual integration than mocking the limiter.
 *   - Mock: prisma, requireAdmin, bcrypt, next/cache (revalidatePath).
 *   - Never call real DB, never call real bcrypt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticator } from "otplib";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────
// vi.mock factories run before imports; vi.hoisted lifts refs so the
// factories can close over them.

const {
  requireAdminMock,
  prismaMock,
  bcryptCompareMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  const prisma = {
    adminUser: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    restaurant: {
      findUnique: vi.fn(),
    },
    adminRecoveryCode: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    requireAdminMock: vi.fn(),
    prismaMock: prisma,
    bcryptCompareMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("bcryptjs", () => ({
  default: { compare: bcryptCompareMock },
  compare: bcryptCompareMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

// We spy on lib/mfa's verifyTotpCode using vi.spyOn later — do NOT mock
// the whole module so the real crypto (encrypt/decrypt/generateRecoveryCodes)
// still runs.
import * as mfaLib from "@/lib/mfa";

// Rate limiter — real, reset between tests by re-importing the actions
// module via resetModules pattern.
import { clearEnrollmentAttempts } from "@/lib/mfa-server";

// Now safe to import the module under test.
import {
  startEnrollment,
  confirmEnrollment,
  regenerateRecoveryCodes,
  disableMfa,
} from "@/app/admin/(protected)/settings/mfa/actions";

// ─── Test doubles ──────────────────────────────────────────────────────────

const ADMIN_ID = "admin-1";
const REST_ID = "rest-1";
const OTHER_REST_ID = "rest-999";

type AdminRow = {
  id: string;
  restaurantId: string;
  email: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  passwordHash: string;
  mfaEnabledAt: Date | null;
  mfaEnrolledAt: Date | null;
  mfaSecretEnc: string | null;
};

function makeAdmin(overrides: Partial<AdminRow> = {}): AdminRow {
  return {
    id: ADMIN_ID,
    restaurantId: REST_ID,
    email: "admin@example.com",
    role: "MANAGER",
    passwordHash: "$2a$10$fakehash",
    mfaEnabledAt: null,
    mfaEnrolledAt: null,
    mfaSecretEnc: null,
    ...overrides,
  };
}

function mockSession(overrides: { adminUserId?: string | null; restaurantId?: string | null } = {}) {
  const user: Record<string, unknown> = {
    adminUserId: ADMIN_ID,
    restaurantId: REST_ID,
    role: "ADMIN",
  };
  if (overrides.adminUserId === null) delete user.adminUserId;
  else if (overrides.adminUserId !== undefined) user.adminUserId = overrides.adminUserId;
  if (overrides.restaurantId === null) delete user.restaurantId;
  else if (overrides.restaurantId !== undefined) user.restaurantId = overrides.restaurantId;
  requireAdminMock.mockResolvedValue({ user });
}

/**
 * Build a fake $transaction that runs the callback with a `tx` mock built
 * from prismaMock's own mock functions (so we can assert calls). Extra
 * overrides let a single test throw from a specific tx method.
 */
function stubTransaction(
  txOverrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
) {
  const tx = {
    adminUser: {
      findFirst: prismaMock.adminUser.findFirst,
      update: prismaMock.adminUser.update,
    },
    adminRecoveryCode: {
      deleteMany: prismaMock.adminRecoveryCode.deleteMany,
      createMany: prismaMock.adminRecoveryCode.createMany,
    },
    ...txOverrides,
  };
  prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => {
    return cb(tx);
  });
  return tx;
}

// ─── beforeEach: wipe everything ───────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset rate-limiter bucket for the test admin so lockout tests don't
  // leak across cases. clearEnrollmentAttempts is a no-op on unknown ids.
  clearEnrollmentAttempts(ADMIN_ID);
  clearEnrollmentAttempts(OTHER_REST_ID);
  clearEnrollmentAttempts("cross-tenant-admin");
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// startEnrollment
// ═══════════════════════════════════════════════════════════════════════════

describe("startEnrollment", () => {
  it("happy path: returns base32 secret and otpauth:// URL for un-enrolled admin", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());
    prismaMock.restaurant.findUnique.mockResolvedValue({ slug: "fsskitchen", name: "FS Kitchen" });

    const result = await startEnrollment();

    expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(result.secret.length).toBeGreaterThan(0);
    expect(result.otpauthUrl.startsWith("otpauth://totp/")).toBe(true);
    // Issuer includes tenant slug.
    expect(result.otpauthUrl).toContain("fsskitchen");
  });

  it("refuses when caller is already enrolled (mfaEnabledAt + mfaSecretEnc set)", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        mfaEnabledAt: new Date("2025-01-01"),
        mfaSecretEnc: "iv:tag:data",
      }),
    );

    await expect(startEnrollment()).rejects.toThrow("2FA is already enabled on this account.");
    // Restaurant lookup must not run once we know we're going to refuse.
    expect(prismaMock.restaurant.findUnique).not.toHaveBeenCalled();
  });

  it("throws ERR_UNAUTHENTICATED when session has no adminUserId", async () => {
    mockSession({ adminUserId: null });
    await expect(startEnrollment()).rejects.toThrow("Not authenticated.");
    expect(prismaMock.adminUser.findFirst).not.toHaveBeenCalled();
  });

  it("throws ERR_UNAUTHENTICATED when session has no restaurantId", async () => {
    mockSession({ restaurantId: null });
    await expect(startEnrollment()).rejects.toThrow("Not authenticated.");
    expect(prismaMock.adminUser.findFirst).not.toHaveBeenCalled();
  });

  it("cross-tenant spoof: findFirst scoped to (adminUserId, restaurantId); returning null → ERR_UNAUTHENTICATED", async () => {
    // Simulate an attacker with a valid adminUserId but the session's
    // restaurantId points at a tenant they do NOT belong to. Prisma
    // findFirst with both fields in the where clause returns null.
    mockSession({ adminUserId: "cross-tenant-admin", restaurantId: OTHER_REST_ID });
    prismaMock.adminUser.findFirst.mockResolvedValue(null);

    await expect(startEnrollment()).rejects.toThrow("Not authenticated.");

    // Verify tenant scoping is enforced in the where clause.
    expect(prismaMock.adminUser.findFirst).toHaveBeenCalledWith({
      where: { id: "cross-tenant-admin", restaurantId: OTHER_REST_ID },
    });
    expect(prismaMock.restaurant.findUnique).not.toHaveBeenCalled();
  });

  it("restaurant lookup miss → generic error, no secret leaked in message", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());
    prismaMock.restaurant.findUnique.mockResolvedValue(null);

    await expect(startEnrollment()).rejects.toThrow("Something went wrong. Please try again.");
    // No secret in the thrown message — the generic string was used.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// confirmEnrollment
// ═══════════════════════════════════════════════════════════════════════════

describe("confirmEnrollment", () => {
  it("happy path: writes encrypted secret + mfaEnabledAt + 10 recovery codes atomically", async () => {
    mockSession();
    const admin = makeAdmin();
    prismaMock.adminUser.findFirst.mockResolvedValue(admin);
    stubTransaction();

    const secret = mfaLib.generateTotpSecret();
    const code = authenticator.generate(secret);

    const result = await confirmEnrollment(secret, code);

    // Plaintext codes returned to caller.
    expect(result.recoveryCodes).toHaveLength(10);
    result.recoveryCodes.forEach((c) => expect(c).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/));

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // adminUser.update called with encrypted secret (NOT plaintext) and a Date for mfaEnabledAt.
    expect(prismaMock.adminUser.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.adminUser.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: ADMIN_ID });
    const { mfaSecretEnc, mfaEnabledAt, mfaEnrolledAt } = updateArgs.data;
    expect(mfaSecretEnc).toBeTruthy();
    expect(mfaSecretEnc).not.toBe(secret); // encrypted, not plaintext
    expect(mfaSecretEnc).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // GCM wire format
    expect(mfaEnabledAt).toBeInstanceOf(Date);
    // First enrollment → mfaEnrolledAt equals mfaEnabledAt (both = now).
    expect(mfaEnrolledAt).toEqual(mfaEnabledAt);

    // 10 recovery codes inserted.
    expect(prismaMock.adminRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { adminUserId: ADMIN_ID },
    });
    expect(prismaMock.adminRecoveryCode.createMany).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.adminRecoveryCode.createMany.mock.calls[0][0];
    expect(createArgs.data).toHaveLength(10);
    createArgs.data.forEach((row: { adminUserId: string; codeHash: string }) => {
      expect(row.adminUserId).toBe(ADMIN_ID);
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("preserves an existing mfaEnrolledAt from a prior enrollment", async () => {
    mockSession();
    const priorEnrolledAt = new Date("2024-01-15T00:00:00Z");
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({ mfaEnrolledAt: priorEnrolledAt }),
    );
    stubTransaction();

    const secret = mfaLib.generateTotpSecret();
    const code = authenticator.generate(secret);

    await confirmEnrollment(secret, code);

    const updateArgs = prismaMock.adminUser.update.mock.calls[0][0];
    expect(updateArgs.data.mfaEnrolledAt).toEqual(priorEnrolledAt);
    // But mfaEnabledAt is a fresh Date.
    expect(updateArgs.data.mfaEnabledAt).toBeInstanceOf(Date);
    expect(updateArgs.data.mfaEnabledAt).not.toEqual(priorEnrolledAt);
  });

  it("sets mfaEnrolledAt=now on first-ever enrollment (mfaEnrolledAt was null)", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin({ mfaEnrolledAt: null }));
    stubTransaction();

    const secret = mfaLib.generateTotpSecret();
    const code = authenticator.generate(secret);

    await confirmEnrollment(secret, code);

    const { mfaEnrolledAt, mfaEnabledAt } = prismaMock.adminUser.update.mock.calls[0][0].data;
    expect(mfaEnrolledAt).toEqual(mfaEnabledAt); // both == now
  });

  it("bad TOTP code: throws ERR_INVALID_CODE and does NOT write to DB", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());

    const secret = mfaLib.generateTotpSecret();
    // Manufacture a code that is definitely wrong.
    const good = authenticator.generate(secret);
    const bad = good === "000000" ? "111111" : "000000";

    await expect(confirmEnrollment(secret, bad)).rejects.toThrow("That code didn't match. Try again.");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
  });

  it("malformed secret ('' or undefined): throws ERR_INVALID_CODE and records a failure", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());

    await expect(confirmEnrollment("", "123456")).rejects.toThrow(
      "That code didn't match. Try again.",
    );
    // A second call with undefined-cast-as-string: the source uses
    // `typeof secret !== "string"` so passing undefined trips the guard.
    await expect(
      confirmEnrollment(undefined as unknown as string, "123456"),
    ).rejects.toThrow("That code didn't match. Try again.");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["empty code", ""],
    ["non-numeric", "abcdef"],
    ["too short", "12345"],
    ["too long", "1234567"],
  ])("malformed code (%s): throws ERR_INVALID_CODE, no DB write", async (_desc, code) => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());
    const secret = mfaLib.generateTotpSecret();

    await expect(confirmEnrollment(secret, code)).rejects.toThrow(
      "That code didn't match. Try again.",
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rate limit engages: 5 bad attempts → 6th throws ERR_RATE_LIMITED before verifyTotpCode runs", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());
    const secret = mfaLib.generateTotpSecret();
    const spy = vi.spyOn(mfaLib, "verifyTotpCode");

    // Force verifyTotpCode to always return false so each of these registers
    // as a failure and hits recordEnrollmentFailure.
    spy.mockReturnValue(false);

    for (let i = 0; i < 5; i++) {
      await expect(confirmEnrollment(secret, "000000")).rejects.toThrow(
        "That code didn't match. Try again.",
      );
    }
    expect(spy).toHaveBeenCalledTimes(5);

    // 6th attempt must be rejected by the rate limiter BEFORE verifyTotpCode
    // is called (short-circuit before crypto).
    spy.mockClear();
    await expect(confirmEnrollment(secret, "000000")).rejects.toThrow(
      "Too many failed attempts. Please wait a few minutes and try again.",
    );
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("rate limit cleared on success: 4 fails + a success → attempts reset (next 4 fails don't lock)", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());
    stubTransaction();

    const secret = mfaLib.generateTotpSecret();
    const spy = vi.spyOn(mfaLib, "verifyTotpCode");

    // 4 failures.
    spy.mockReturnValue(false);
    for (let i = 0; i < 4; i++) {
      await expect(confirmEnrollment(secret, "000000")).rejects.toThrow();
    }

    // Success — the action must call clearEnrollmentAttempts internally.
    spy.mockReturnValue(true);
    await expect(confirmEnrollment(secret, "111111")).resolves.toBeDefined();

    // Now 4 fresh failures must NOT lock (bucket was cleared).
    spy.mockReturnValue(false);
    for (let i = 0; i < 4; i++) {
      await expect(confirmEnrollment(secret, "000000")).rejects.toThrow(
        "That code didn't match. Try again.",
      );
    }

    // 5th fresh failure — NOW locked out.
    await expect(confirmEnrollment(secret, "000000")).rejects.toThrow(
      "That code didn't match. Try again.",
    );
    await expect(confirmEnrollment(secret, "000000")).rejects.toThrow(
      "Too many failed attempts. Please wait a few minutes and try again.",
    );

    spy.mockRestore();
  });

  it("transaction rollback: createMany throws → outer $transaction rejects, no partial commit visible", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());

    // Build a tx where createMany throws. We wire this into $transaction's
    // callback so the callback throws — mirroring how Prisma actually
    // aborts the transaction on inner error.
    const createManyErr = new Error("simulated createMany failure");
    prismaMock.$transaction.mockImplementation(async (cb) => {
      const tx = {
        adminUser: {
          findFirst: vi.fn().mockResolvedValue({ id: ADMIN_ID }),
          update: prismaMock.adminUser.update.mockResolvedValue({}),
        },
        adminRecoveryCode: {
          deleteMany: prismaMock.adminRecoveryCode.deleteMany.mockResolvedValue({}),
          createMany: vi.fn().mockRejectedValue(createManyErr),
        },
      };
      return cb(tx);
    });

    const secret = mfaLib.generateTotpSecret();
    const code = authenticator.generate(secret);

    await expect(confirmEnrollment(secret, code)).rejects.toThrow("simulated createMany failure");

    // update was called (before the createMany failure), and the throw
    // bubbles out to the caller as-is — the $transaction rejection.
    // No revalidatePath because the action never reached that point.
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("in-transaction tenant re-check: tx.findFirst returns null → ERR_UNAUTHENTICATED, no update/createMany", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(makeAdmin());

    const innerFindFirst = vi.fn().mockResolvedValue(null);
    const innerUpdate = vi.fn();
    const innerDeleteMany = vi.fn();
    const innerCreateMany = vi.fn();

    prismaMock.$transaction.mockImplementation(async (cb) => {
      const tx = {
        adminUser: { findFirst: innerFindFirst, update: innerUpdate },
        adminRecoveryCode: { deleteMany: innerDeleteMany, createMany: innerCreateMany },
      };
      return cb(tx);
    });

    const secret = mfaLib.generateTotpSecret();
    const code = authenticator.generate(secret);

    await expect(confirmEnrollment(secret, code)).rejects.toThrow("Not authenticated.");
    expect(innerFindFirst).toHaveBeenCalledWith({
      where: { id: ADMIN_ID, restaurantId: REST_ID },
      select: { id: true },
    });
    expect(innerUpdate).not.toHaveBeenCalled();
    expect(innerDeleteMany).not.toHaveBeenCalled();
    expect(innerCreateMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// regenerateRecoveryCodes
// ═══════════════════════════════════════════════════════════════════════════

describe("regenerateRecoveryCodes", () => {
  it("happy path: enrolled admin + valid TOTP → old codes deleted, 10 new codes returned", async () => {
    mockSession();
    const secret = mfaLib.generateTotpSecret();
    const enc = mfaLib.encryptTotpSecret(secret);
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        mfaSecretEnc: enc,
        mfaEnabledAt: new Date("2024-06-01"),
      }),
    );
    stubTransaction();

    const code = authenticator.generate(secret);
    const result = await regenerateRecoveryCodes(code);

    expect(result.recoveryCodes).toHaveLength(10);
    result.recoveryCodes.forEach((c) => expect(c).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/));
    expect(prismaMock.adminRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { adminUserId: ADMIN_ID },
    });
    expect(prismaMock.adminRecoveryCode.createMany).toHaveBeenCalledTimes(1);
    const rows = prismaMock.adminRecoveryCode.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(10);
  });

  it("not enrolled (mfaSecretEnc null): throws ERR_INVALID_CODE (SAME wording as bad code) — no 'not enrolled' leak", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({ mfaSecretEnc: null, mfaEnabledAt: null }),
    );

    let thrown: Error | undefined;
    try {
      await regenerateRecoveryCodes("123456");
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toBe("That code didn't match. Try again.");
    // Explicit anti-fingerprint assertion: the error must NOT reveal
    // enrollment state.
    expect(thrown!.message.toLowerCase()).not.toContain("not enrolled");
    expect(thrown!.message.toLowerCase()).not.toContain("enroll");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("bad TOTP code (correctly enrolled): throws ERR_INVALID_CODE, no DB writes", async () => {
    mockSession();
    const secret = mfaLib.generateTotpSecret();
    const enc = mfaLib.encryptTotpSecret(secret);
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({ mfaSecretEnc: enc, mfaEnabledAt: new Date() }),
    );

    const good = authenticator.generate(secret);
    const bad = good === "000000" ? "111111" : "000000";

    await expect(regenerateRecoveryCodes(bad)).rejects.toThrow("That code didn't match. Try again.");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.adminRecoveryCode.createMany).not.toHaveBeenCalled();
  });

  it("corrupt mfaSecretEnc: decrypt throws → caught, ERR_GENERIC returned (no crypto detail leaked)", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({ mfaSecretEnc: "not-valid-ciphertext", mfaEnabledAt: new Date() }),
    );

    let thrown: Error | undefined;
    try {
      await regenerateRecoveryCodes("123456");
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toBe("Something went wrong. Please try again.");
    // No crypto library detail leaked.
    expect(thrown!.message.toLowerCase()).not.toContain("iv");
    expect(thrown!.message.toLowerCase()).not.toContain("cipher");
    expect(thrown!.message.toLowerCase()).not.toContain("tag");
    expect(thrown!.message.toLowerCase()).not.toContain("decrypt");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("cross-tenant defense: in-tx findFirst returns null → ERR_UNAUTHENTICATED, no writes to code table", async () => {
    mockSession();
    const secret = mfaLib.generateTotpSecret();
    const enc = mfaLib.encryptTotpSecret(secret);
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({ mfaSecretEnc: enc, mfaEnabledAt: new Date() }),
    );

    const innerFindFirst = vi.fn().mockResolvedValue(null);
    const innerDeleteMany = vi.fn();
    const innerCreateMany = vi.fn();
    prismaMock.$transaction.mockImplementation(async (cb) => {
      return cb({
        adminUser: { findFirst: innerFindFirst },
        adminRecoveryCode: { deleteMany: innerDeleteMany, createMany: innerCreateMany },
      });
    });

    const code = authenticator.generate(secret);
    await expect(regenerateRecoveryCodes(code)).rejects.toThrow("Not authenticated.");
    expect(innerFindFirst).toHaveBeenCalledWith({
      where: { id: ADMIN_ID, restaurantId: REST_ID },
      select: { id: true },
    });
    expect(innerDeleteMany).not.toHaveBeenCalled();
    expect(innerCreateMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// disableMfa
// ═══════════════════════════════════════════════════════════════════════════

describe("disableMfa", () => {
  it("OWNER short-circuit BEFORE bcrypt: correct password still refused, bcrypt.compare NOT called", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "OWNER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );

    await expect(disableMfa("correct-password")).rejects.toThrow(
      "OWNER accounts are required to keep 2FA enabled. Ask another OWNER to promote you first if you need to disable.",
    );
    expect(bcryptCompareMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
  });

  it("OWNER short-circuit — wrong password path is indistinguishable from correct password path", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "OWNER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );

    await expect(disableMfa("wrong-password")).rejects.toThrow(
      "OWNER accounts are required to keep 2FA enabled. Ask another OWNER to promote you first if you need to disable.",
    );
    expect(bcryptCompareMock).not.toHaveBeenCalled();
  });

  it("not enrolled (MANAGER, correct pw, mfaEnabled=null): throws ERR_NOT_ENROLLED", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({ role: "MANAGER", mfaEnabledAt: null, mfaSecretEnc: null }),
    );

    await expect(disableMfa("any-password")).rejects.toThrow("2FA is not enabled on this account.");
    expect(bcryptCompareMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("wrong password (MANAGER, enrolled): throws ERR_INVALID_PASSWORD, no DB update, bcrypt WAS called", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "MANAGER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );
    bcryptCompareMock.mockResolvedValue(false);

    await expect(disableMfa("wrong-password")).rejects.toThrow("Password is incorrect.");
    expect(bcryptCompareMock).toHaveBeenCalledWith("wrong-password", "$2a$10$fakehash");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("empty password (MANAGER, enrolled): throws ERR_INVALID_PASSWORD WITHOUT calling bcrypt", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "MANAGER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );

    await expect(disableMfa("")).rejects.toThrow("Password is incorrect.");
    expect(bcryptCompareMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("undefined password (defensive): throws ERR_INVALID_PASSWORD WITHOUT calling bcrypt (no crash on undefined arg)", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "MANAGER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );

    await expect(disableMfa(undefined as unknown as string)).rejects.toThrow(
      "Password is incorrect.",
    );
    expect(bcryptCompareMock).not.toHaveBeenCalled();
  });

  it("happy path (MANAGER, correct pw): $transaction runs; update clears mfa* fields; deleteMany runs", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "MANAGER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
        mfaEnrolledAt: new Date("2024-01-01"),
      }),
    );
    bcryptCompareMock.mockResolvedValue(true);

    // Inner tx with MANAGER role — passes the re-check.
    const innerFindFirst = vi.fn().mockResolvedValue({ id: ADMIN_ID, role: "MANAGER" });
    const innerUpdate = vi.fn().mockResolvedValue({});
    const innerDeleteMany = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb) => {
      return cb({
        adminUser: { findFirst: innerFindFirst, update: innerUpdate },
        adminRecoveryCode: { deleteMany: innerDeleteMany },
      });
    });

    await expect(disableMfa("correct-password")).resolves.toBeUndefined();
    expect(bcryptCompareMock).toHaveBeenCalledWith("correct-password", "$2a$10$fakehash");
    expect(innerUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = innerUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: ADMIN_ID });
    expect(updateArgs.data).toEqual({
      mfaSecretEnc: null,
      mfaEnabledAt: null,
      mfaEnrolledAt: null,
    });
    expect(innerDeleteMany).toHaveBeenCalledWith({ where: { adminUserId: ADMIN_ID } });
  });

  it("in-tx role re-check: pre-tx MANAGER but in-tx findFirst returns OWNER → ERR_OWNER_CANNOT_DISABLE, no update", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "MANAGER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );
    bcryptCompareMock.mockResolvedValue(true);

    const innerFindFirst = vi.fn().mockResolvedValue({ id: ADMIN_ID, role: "OWNER" });
    const innerUpdate = vi.fn();
    const innerDeleteMany = vi.fn();
    prismaMock.$transaction.mockImplementation(async (cb) => {
      return cb({
        adminUser: { findFirst: innerFindFirst, update: innerUpdate },
        adminRecoveryCode: { deleteMany: innerDeleteMany },
      });
    });

    await expect(disableMfa("correct-password")).rejects.toThrow(
      "OWNER accounts are required to keep 2FA enabled. Ask another OWNER to promote you first if you need to disable.",
    );
    expect(innerUpdate).not.toHaveBeenCalled();
    expect(innerDeleteMany).not.toHaveBeenCalled();
  });

  it("STAFF role behaves same as MANAGER — allowed to disable with correct password", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "STAFF",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );
    bcryptCompareMock.mockResolvedValue(true);

    const innerFindFirst = vi.fn().mockResolvedValue({ id: ADMIN_ID, role: "STAFF" });
    const innerUpdate = vi.fn().mockResolvedValue({});
    const innerDeleteMany = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (cb) => {
      return cb({
        adminUser: { findFirst: innerFindFirst, update: innerUpdate },
        adminRecoveryCode: { deleteMany: innerDeleteMany },
      });
    });

    await expect(disableMfa("correct-password")).resolves.toBeUndefined();
    expect(bcryptCompareMock).toHaveBeenCalled();
    expect(innerUpdate).toHaveBeenCalledTimes(1);
    expect(innerDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("in-tx tenant re-check: findFirst returns null → ERR_UNAUTHENTICATED, no update/deleteMany", async () => {
    mockSession();
    prismaMock.adminUser.findFirst.mockResolvedValue(
      makeAdmin({
        role: "MANAGER",
        mfaEnabledAt: new Date(),
        mfaSecretEnc: "iv:tag:data",
      }),
    );
    bcryptCompareMock.mockResolvedValue(true);

    const innerFindFirst = vi.fn().mockResolvedValue(null);
    const innerUpdate = vi.fn();
    const innerDeleteMany = vi.fn();
    prismaMock.$transaction.mockImplementation(async (cb) => {
      return cb({
        adminUser: { findFirst: innerFindFirst, update: innerUpdate },
        adminRecoveryCode: { deleteMany: innerDeleteMany },
      });
    });

    await expect(disableMfa("correct-password")).rejects.toThrow("Not authenticated.");
    expect(innerUpdate).not.toHaveBeenCalled();
    expect(innerDeleteMany).not.toHaveBeenCalled();
  });
});
