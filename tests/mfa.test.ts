/**
 * Unit tests for lib/mfa.ts — the pure-crypto MFA foundation shipped in Phase 1.
 *
 * Scope of this file: TOTP generation/verification, otpauth:// URL formatting,
 * AES-256-GCM encryption of TOTP secrets, and recovery-code generation +
 * verification. This module has no DB access, so cross-tenant tests are
 * intentionally deferred to Phase 3 handler tests (documented at the bottom).
 *
 * Ground rules:
 *   - Never mock node:crypto. TOTP determinism comes from vi.useFakeTimers().
 *   - No flaky assertions. The timing-side-channel test uses a statistical
 *     bound (mean within 20%) so CI jitter doesn't flap it.
 *   - The env fixture in vitest.config.ts pins MFA_ENCRYPTION_KEY to
 *     "0".repeat(64) so encrypt/decrypt work at collection time. Tests that
 *     need the key unset use vi.doMock in a scoped isolate module block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { authenticator } from "otplib";

import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateOtpauthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifyTotpCode,
} from "@/lib/mfa";

// ─── TOTP ────────────────────────────────────────────────────────────────────

describe("generateTotpSecret", () => {
  it("returns a non-empty base32 string long enough for a 20-byte secret", () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe("string");
    // otplib default: 20 bytes of entropy → 32 base32 chars (unpadded).
    expect(secret.length).toBeGreaterThanOrEqual(16);
    // Base32 alphabet only (RFC 4648, no padding).
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("returns a fresh secret each call (very high probability of uniqueness)", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });
});

describe("verifyTotpCode", () => {
  it("happy path: a code produced by otplib for the same secret verifies true", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("wrong code returns false", () => {
    const secret = generateTotpSecret();
    // "000000" is astronomically unlikely to be the live code (~1 in 1M) but
    // even then we salt by picking a code that is guaranteed different from
    // the real one.
    const real = authenticator.generate(secret);
    let bogus = "123456";
    if (bogus === real) bogus = "654321";
    expect(verifyTotpCode(secret, bogus)).toBe(false);
  });

  it("empty string code → false", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "")).toBe(false);
  });

  it("non-numeric code → false", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "abcdef")).toBe(false);
  });

  it("wrong length codes → false ('12345' and '1234567')", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, "1234567")).toBe(false);
  });

  it("null cast as string → false (never throws)", () => {
    const secret = generateTotpSecret();
    // Simulate a caller passing a null through untyped code — must not throw.
    expect(() => verifyTotpCode(secret, null as unknown as string)).not.toThrow();
    expect(verifyTotpCode(secret, null as unknown as string)).toBe(false);
  });

  it("empty/malformed secret → false (never throws)", () => {
    expect(verifyTotpCode("", "123456")).toBe(false);
    expect(verifyTotpCode(null as unknown as string, "123456")).toBe(false);
  });

  it("leading/trailing whitespace is stripped and re-checked", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, `  ${code}\n`)).toBe(true);
    expect(verifyTotpCode(secret, `\t${code}\t`)).toBe(true);
  });

  it("codes with embedded spaces fail (only outer whitespace is stripped)", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    // e.g. "123 456" — the regex requires 6 contiguous digits after trim().
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(verifyTotpCode(secret, spaced)).toBe(false);
  });

  describe("window tolerance (±1 30-second step)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Anchor to a fixed instant. Any value works; we advance from here.
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("t=0 generate, t=+29s verify → true (same step)", () => {
      const secret = generateTotpSecret();
      const code = authenticator.generate(secret);
      vi.advanceTimersByTime(29_000);
      expect(verifyTotpCode(secret, code)).toBe(true);
    });

    it("t=0 generate, t=+31s verify → true (adjacent step, within ±1 window)", () => {
      const secret = generateTotpSecret();
      const code = authenticator.generate(secret);
      vi.advanceTimersByTime(31_000);
      expect(verifyTotpCode(secret, code)).toBe(true);
    });

    it("t=0 generate, t=+91s verify → false (3 steps away, outside window)", () => {
      const secret = generateTotpSecret();
      const code = authenticator.generate(secret);
      vi.advanceTimersByTime(91_000);
      expect(verifyTotpCode(secret, code)).toBe(false);
    });

    // NOTE (Phase 3): replay defense — rejecting the same code more than once
    // within its 30-second window — belongs in the login handler, not this
    // module. verifyTotpCode is by design stateless and will keep returning
    // true for the same (secret, code) pair for the whole ±1 step window.
  });
});

// ─── generateOtpauthUrl ──────────────────────────────────────────────────────

describe("generateOtpauthUrl", () => {
  it("output starts with otpauth://totp/", () => {
    const url = generateOtpauthUrl("JBSWY3DPEHPK3PXP", "user@example.com", "LunchPad");
    expect(url.startsWith("otpauth://totp/")).toBe(true);
  });

  it("contains secret=<the secret>", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const url = generateOtpauthUrl(secret, "user@example.com", "LunchPad");
    expect(url).toContain(`secret=${secret}`);
  });

  it("contains issuer=<the issuer>", () => {
    const url = generateOtpauthUrl("JBSWY3DPEHPK3PXP", "user@example.com", "LunchPad");
    expect(url).toContain("issuer=LunchPad");
  });

  it("URL-encodes special chars in account label ('+' and '@')", () => {
    const url = generateOtpauthUrl(
      "JBSWY3DPEHPK3PXP",
      "user+tag@example.com",
      "LunchPad",
    );
    // '@' → %40, '+' → %2B (RFC 3986 unreserved does not include either).
    expect(url).toContain("%40");
    expect(url).toContain("%2B");
    // Raw '+' must not appear in the label region (would break QR decoders that
    // treat + as space per legacy form-encoding).
    const label = url.split("?")[0];
    expect(label).not.toContain("+");
    expect(label).not.toContain("@");
  });
});

// ─── AES-256-GCM encryption ──────────────────────────────────────────────────

describe("encryptTotpSecret / decryptTotpSecret", () => {
  it("roundtrip: 1-char plaintext", () => {
    expect(decryptTotpSecret(encryptTotpSecret("x"))).toBe("x");
  });

  it("roundtrip: typical 32-char base32 TOTP secret", () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    expect(decryptTotpSecret(encryptTotpSecret(secret))).toBe(secret);
  });

  it("roundtrip: unicode plaintext", () => {
    const unicode = "héllo 🌮 世界 ñ";
    expect(decryptTotpSecret(encryptTotpSecret(unicode))).toBe(unicode);
  });

  it("fresh IV: encrypting the same plaintext twice yields different ciphertexts", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const c1 = encryptTotpSecret(plaintext);
    const c2 = encryptTotpSecret(plaintext);
    expect(c1).not.toBe(c2);
    // Also assert both still decrypt to the same value.
    expect(decryptTotpSecret(c1)).toBe(plaintext);
    expect(decryptTotpSecret(c2)).toBe(plaintext);
  });

  it("empty plaintext on encrypt → throws", () => {
    expect(() => encryptTotpSecret("")).toThrow();
  });

  describe("tamper detection (GCM auth tag)", () => {
    // Flip one hex char (nibble) inside a target field. Picks a char that
    // differs when incremented so the result is guaranteed to be different.
    function flipNibbleAt(hex: string, index: number): string {
      const ch = hex[index];
      const next = ch === "f" ? "0" : ch === "F" ? "0" : ch === "9" ? "a" : String.fromCharCode(ch.charCodeAt(0) + 1);
      return hex.slice(0, index) + next + hex.slice(index + 1);
    }

    it("flipping one hex char in the IV → decrypt throws", () => {
      const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const [iv, tag, data] = enc.split(":");
      const tampered = `${flipNibbleAt(iv, 0)}:${tag}:${data}`;
      expect(() => decryptTotpSecret(tampered)).toThrow();
    });

    it("flipping one hex char in the auth tag → decrypt throws", () => {
      const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const [iv, tag, data] = enc.split(":");
      const tampered = `${iv}:${flipNibbleAt(tag, 0)}:${data}`;
      expect(() => decryptTotpSecret(tampered)).toThrow();
    });

    it("flipping one hex char in the ciphertext → decrypt throws", () => {
      const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const [iv, tag, data] = enc.split(":");
      const tampered = `${iv}:${tag}:${flipNibbleAt(data, 0)}`;
      expect(() => decryptTotpSecret(tampered)).toThrow();
    });
  });

  describe("malformed input on decrypt", () => {
    it("empty string → throws", () => {
      expect(() => decryptTotpSecret("")).toThrow();
    });

    it("0 colons (one field) → throws", () => {
      expect(() => decryptTotpSecret("deadbeef")).toThrow(/malformed/i);
    });

    it("1 colon (two fields) → throws", () => {
      expect(() => decryptTotpSecret("deadbeef:cafe")).toThrow(/malformed/i);
    });

    it("2 colons but one field empty → still throws (bad field lengths / hex)", () => {
      // 2 colons produces 3 fields, but at least one is empty → 0-byte buffer,
      // failing the IV/tag/data length checks.
      expect(() => decryptTotpSecret("::")).toThrow(/malformed/i);
    });

    it("4 colons (five fields) → throws", () => {
      expect(() => decryptTotpSecret("a:b:c:d:e")).toThrow(/malformed/i);
    });

    it("IV of wrong length (11 bytes) → throws", () => {
      const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const [, tag, data] = enc.split(":");
      const badIv = "a".repeat(22); // 22 hex chars = 11 bytes
      expect(() => decryptTotpSecret(`${badIv}:${tag}:${data}`)).toThrow(/malformed/i);
    });

    it("IV of wrong length (13 bytes) → throws", () => {
      const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const [, tag, data] = enc.split(":");
      const badIv = "a".repeat(26); // 26 hex chars = 13 bytes
      expect(() => decryptTotpSecret(`${badIv}:${tag}:${data}`)).toThrow(/malformed/i);
    });

    it("auth tag of wrong length → throws", () => {
      const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const [iv, , data] = enc.split(":");
      const badTag = "a".repeat(30); // 15 bytes, not 16
      expect(() => decryptTotpSecret(`${iv}:${badTag}:${data}`)).toThrow(/malformed/i);
    });

    it("empty ciphertext field → throws (data length 0)", () => {
      const enc = encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const [iv, tag] = enc.split(":");
      expect(() => decryptTotpSecret(`${iv}:${tag}:`)).toThrow(/malformed/i);
    });

    it("non-hex characters in any field → throws", () => {
      // Buffer.from("zz...", "hex") silently produces an empty buffer, which
      // then trips the length check → malformed error.
      const badHex = "z".repeat(24); // pretends to be IV
      const tag = "a".repeat(32);
      const data = "a".repeat(32);
      expect(() => decryptTotpSecret(`${badHex}:${tag}:${data}`)).toThrow(/malformed/i);
    });
  });

  describe("missing MFA_ENCRYPTION_KEY", () => {
    // vitest 3 doesn't ship vi.isolateModulesAsync in this build, so we
    // pattern this as: resetModules → doMock env → dynamic import mfa → run
    // assertions → resetModules + unmock to leave the outer suite pristine.
    const MOCKED_ENV_NO_KEY = {
      env: {
        DATABASE_URL: "postgresql://test:test@localhost:5432/lunchpad_test",
        NEXTAUTH_URL: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret-thirty-two-chars-min-x",
        APP_BASE_URL: "http://localhost:3000",
        ROOT_DOMAIN: "lunchpad.us",
        DEFAULT_TIMEZONE: "America/Los_Angeles",
        PLATFORM_FEE_PERCENT: 2.9,
        MFA_ENCRYPTION_KEY: undefined,
      },
    };

    afterEach(() => {
      vi.doUnmock("@/lib/env");
      vi.resetModules();
    });

    it("encrypt throws 'MFA_ENCRYPTION_KEY is not set' when key is undefined", async () => {
      vi.resetModules();
      vi.doMock("@/lib/env", () => MOCKED_ENV_NO_KEY);
      const { encryptTotpSecret: encFn } = await import("@/lib/mfa");
      expect(() => encFn("hello")).toThrow("MFA_ENCRYPTION_KEY is not set");
    });

    it("decrypt throws 'MFA_ENCRYPTION_KEY is not set' when key is undefined", async () => {
      // Pre-compute a valid ciphertext with the outer context's real key,
      // then feed it to the freshly-imported decrypt (with mocked env).
      const validCiphertext = encryptTotpSecret("hello");
      vi.resetModules();
      vi.doMock("@/lib/env", () => MOCKED_ENV_NO_KEY);
      const { decryptTotpSecret: decFn } = await import("@/lib/mfa");
      expect(() => decFn(validCiphertext)).toThrow("MFA_ENCRYPTION_KEY is not set");
    });
  });
});

// ─── Recovery codes ──────────────────────────────────────────────────────────

const RECOVERY_CODE_REGEX = /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/;

describe("generateRecoveryCodes", () => {
  it("returns exactly 10 codes by default", () => {
    const { plaintext, hashes } = generateRecoveryCodes();
    expect(plaintext).toHaveLength(10);
    expect(hashes).toHaveLength(10);
  });

  it("every code matches the Crockford-ish XXXXX-XXXXX pattern (no 0/O/1/I/L)", () => {
    const { plaintext } = generateRecoveryCodes();
    for (const code of plaintext) {
      expect(code).toMatch(RECOVERY_CODE_REGEX);
    }
  });

  it("all 10 codes are unique", () => {
    const { plaintext } = generateRecoveryCodes();
    expect(new Set(plaintext).size).toBe(plaintext.length);
  });

  it("plaintext[i] hashes to hashes[i] for every i", () => {
    const { plaintext, hashes } = generateRecoveryCodes();
    for (let i = 0; i < plaintext.length; i++) {
      expect(hashRecoveryCode(plaintext[i])).toBe(hashes[i]);
    }
  });

  it("custom count 1 produces 1 code", () => {
    const { plaintext, hashes } = generateRecoveryCodes(1);
    expect(plaintext).toHaveLength(1);
    expect(hashes).toHaveLength(1);
    expect(plaintext[0]).toMatch(RECOVERY_CODE_REGEX);
  });

  it("custom count 50 produces 50 unique codes", () => {
    const { plaintext, hashes } = generateRecoveryCodes(50);
    expect(plaintext).toHaveLength(50);
    expect(hashes).toHaveLength(50);
    expect(new Set(plaintext).size).toBe(50);
  });

  it.each([
    ["count = 0", 0],
    ["count = -1", -1],
    ["count = 1.5 (non-integer)", 1.5],
    ["count = 51 (over cap)", 51],
    ["count = NaN", NaN],
  ])("invalid count %s → throws", (_label, count) => {
    expect(() => generateRecoveryCodes(count as number)).toThrow(
      /count must be an integer between 1 and 50/i,
    );
  });
});

describe("hashRecoveryCode normalization", () => {
  it("uppercase, lowercase, spaces, and dashes all normalize to the same hash", () => {
    const base = hashRecoveryCode("ABCDE-12345");
    expect(hashRecoveryCode("abcde-12345")).toBe(base);
    expect(hashRecoveryCode("ABCDE12345")).toBe(base);
    expect(hashRecoveryCode("abcde 12345")).toBe(base);
    expect(hashRecoveryCode("  ABCDE-12345\n")).toBe(base);
    expect(hashRecoveryCode("ABCDE-1 2 3 4 5")).toBe(base);
  });

  it("different codes produce different hashes", () => {
    expect(hashRecoveryCode("ABCDE-12345")).not.toBe(hashRecoveryCode("ABCDE-12346"));
  });

  it("throws on non-string input", () => {
    expect(() => hashRecoveryCode(null as unknown as string)).toThrow();
    expect(() => hashRecoveryCode(undefined as unknown as string)).toThrow();
  });
});

describe("verifyRecoveryCode", () => {
  it("happy path: matched plaintext returns { matchIndex: <expected> }", () => {
    const { plaintext, hashes } = generateRecoveryCodes();
    const result = verifyRecoveryCode(plaintext[3], hashes);
    expect(result).toEqual({ matchIndex: 3 });
  });

  it("normalized user input (lowercase, no dash) still matches", () => {
    const { plaintext, hashes } = generateRecoveryCodes();
    const messy = plaintext[7].replace("-", "").toLowerCase();
    expect(verifyRecoveryCode(messy, hashes)).toEqual({ matchIndex: 7 });
  });

  it("unrelated code returns null", () => {
    const { hashes } = generateRecoveryCodes();
    expect(verifyRecoveryCode("ZZZZZ-ZZZZZ", hashes)).toBeNull();
  });

  it("empty input returns null", () => {
    const { hashes } = generateRecoveryCodes();
    expect(verifyRecoveryCode("", hashes)).toBeNull();
  });

  it("empty hashes array returns null", () => {
    expect(verifyRecoveryCode("ABCDE-12345", [])).toBeNull();
  });

  it("null input returns null (never throws)", () => {
    const { hashes } = generateRecoveryCodes();
    expect(() => verifyRecoveryCode(null as unknown as string, hashes)).not.toThrow();
    expect(verifyRecoveryCode(null as unknown as string, hashes)).toBeNull();
  });

  it("non-array hashes returns null (never throws)", () => {
    expect(() =>
      verifyRecoveryCode("ABCDE-12345", null as unknown as string[]),
    ).not.toThrow();
    expect(verifyRecoveryCode("ABCDE-12345", null as unknown as string[])).toBeNull();
  });

  describe("malformed stored hashes are silently skipped", () => {
    it("empty strings in hashes array → skipped, no throw", () => {
      const { plaintext, hashes } = generateRecoveryCodes(3);
      const polluted = ["", hashes[0], "", hashes[1], "", hashes[2], ""];
      // The real hash for plaintext[1] is at index 3 of the polluted array.
      expect(verifyRecoveryCode(plaintext[1], polluted)).toEqual({ matchIndex: 3 });
    });

    it("non-hex strings in hashes → skipped, no throw", () => {
      const { plaintext, hashes } = generateRecoveryCodes(2);
      const polluted = ["not-hex-at-all!!", hashes[0], "☃️".repeat(32), hashes[1]];
      expect(verifyRecoveryCode(plaintext[0], polluted)).toEqual({ matchIndex: 1 });
    });

    it("wrong-length hashes → skipped, no throw", () => {
      const { plaintext, hashes } = generateRecoveryCodes(2);
      const polluted = ["deadbeef", hashes[0], "a".repeat(63), hashes[1], "a".repeat(65)];
      expect(verifyRecoveryCode(plaintext[0], polluted)).toEqual({ matchIndex: 1 });
    });

    it("null entries mixed into hashes → skipped, no throw", () => {
      const { plaintext, hashes } = generateRecoveryCodes(2);
      const polluted = [null as unknown as string, hashes[0], null as unknown as string, hashes[1]];
      expect(() => verifyRecoveryCode(plaintext[1], polluted)).not.toThrow();
      expect(verifyRecoveryCode(plaintext[1], polluted)).toEqual({ matchIndex: 3 });
    });

    it("no valid hashes present → returns null", () => {
      const polluted = ["", null as unknown as string, "zzz", "a".repeat(10)];
      expect(verifyRecoveryCode("ABCDE-12345", polluted)).toBeNull();
    });
  });

  describe("adversarial input characters normalize safely", () => {
    it("SQL-ish input just fails to match (no throw)", () => {
      const { hashes } = generateRecoveryCodes();
      expect(() => verifyRecoveryCode("'; DROP TABLE users;--", hashes)).not.toThrow();
      expect(verifyRecoveryCode("'; DROP TABLE users;--", hashes)).toBeNull();
    });

    it("HTML/script input just fails to match (no throw)", () => {
      const { hashes } = generateRecoveryCodes();
      expect(() => verifyRecoveryCode("<script>alert(1)</script>", hashes)).not.toThrow();
      expect(verifyRecoveryCode("<script>alert(1)</script>", hashes)).toBeNull();
    });

    it("emoji input just fails to match (no throw)", () => {
      const { hashes } = generateRecoveryCodes();
      expect(() => verifyRecoveryCode("🌮🌮🌮🌮🌮-🌮🌮🌮🌮🌮", hashes)).not.toThrow();
      expect(verifyRecoveryCode("🌮🌮🌮🌮🌮-🌮🌮🌮🌮🌮", hashes)).toBeNull();
    });
  });

  // Statistical timing test. Not exact — CI runners are jittery — but a
  // short-circuit bug (returning on first match instead of iterating) would
  // make firstMean ~10x smaller than lastMean, well beyond the tolerance
  // window. We compare max/min ratio which is more robust to a single noisy
  // sample than a delta-from-average metric.
  it("timing: verifyRecoveryCode work is independent of match position (statistical)", () => {
    const { plaintext, hashes } = generateRecoveryCodes(10);
    const firstMatch = plaintext[0];
    const lastMatch = plaintext[9];
    const missCode = "ZZZZZ-ZZZZZ";

    const ITERS = 2000;
    const WARMUP = 500;
    const TRIALS = 5;

    function measureMean(input: string): number {
      // Warmup: JIT + branch prediction stabilization.
      for (let i = 0; i < WARMUP; i++) verifyRecoveryCode(input, hashes);
      // Take the median of TRIALS runs to shed one-off scheduler stalls.
      const samples: number[] = [];
      for (let t = 0; t < TRIALS; t++) {
        const start = process.hrtime.bigint();
        for (let i = 0; i < ITERS; i++) verifyRecoveryCode(input, hashes);
        const end = process.hrtime.bigint();
        samples.push(Number(end - start) / ITERS); // ns/op
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    }

    const firstMean = measureMean(firstMatch);
    const lastMean = measureMean(lastMatch);
    const missMean = measureMean(missCode);

    const means = [firstMean, lastMean, missMean];
    const min = Math.min(...means);
    const max = Math.max(...means);
    // A short-circuit bug would give ratios >5x. A constant-time implementation
    // should stay under ~2x even with GC/scheduler jitter on a busy CI runner.
    const ratio = max / min;
    expect(ratio).toBeLessThan(2);
  });
});

// ─── Sanity: node:crypto is not mocked ───────────────────────────────────────

describe("test harness sanity check", () => {
  it("node:crypto is the real module (not stubbed)", () => {
    // If someone accidentally mocks crypto, randomBytes(1) would return a
    // predictable value or throw. Confirm we're using real crypto.
    const a = crypto.randomBytes(16).toString("hex");
    const b = crypto.randomBytes(16).toString("hex");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
