"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateRecoveryCodes, disableMfa } from "@/app/admin/(protected)/settings/mfa/actions";
import { MfaRecoveryCodesDisplay } from "./mfa-recovery-codes-display";

/**
 * "Already enrolled" management UI. Two flows live in here:
 *
 *   Regenerate recovery codes — requires a fresh TOTP code (proof of
 *     possession of the second factor). On success, replaces existing
 *     codes atomically. New codes shown once via the shared display.
 *
 *   Disable 2FA — for MANAGER/STAFF, requires current password; for
 *     OWNER, the server refuses regardless of password. Server-side
 *     is the source of truth; the client-side hides the button for
 *     OWNERs as a UX nicety, not a security boundary.
 *
 * All state lives in a discriminated union so the component always
 * knows what to render and never gets into an ambiguous half-open
 * state.
 */
type Mode =
  | { kind: "idle" }
  | { kind: "regen" }         // asking for TOTP to regenerate
  | { kind: "regen-done"; codes: string[] } // showing the new codes once
  | { kind: "disable" };      // asking for password to disable

export function MfaManage({
  enrolledAt,
  isOwner,
}: {
  enrolledAt: Date | null;
  isOwner: boolean;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [totp, setTotp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function resetToIdle() {
    setMode({ kind: "idle" });
    setTotp("");
    setPassword("");
    setError(null);
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = totp.trim();
    if (!/^\d{6}$/.test(normalized)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    startTransition(async () => {
      try {
        const { recoveryCodes } = await regenerateRecoveryCodes(normalized);
        setMode({ kind: "regen-done", codes: recoveryCodes });
        setTotp("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Enter your current password.");
      return;
    }
    startTransition(async () => {
      try {
        await disableMfa(password);
        setPassword("");
        // A refresh causes the page to re-fetch and re-render as the
        // "not enrolled" MfaEnroll view.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const enrolledLabel = enrolledAt
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(
        enrolledAt,
      )
    : "some time ago";

  if (mode.kind === "regen-done") {
    return (
      <MfaRecoveryCodesDisplay
        codes={mode.codes}
        onDone={() => {
          resetToIdle();
          router.refresh();
        }}
        title="Here are your new recovery codes"
        subtitle="Your previous recovery codes have been revoked. Save these somewhere safe — you won't be able to see them again."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-editorial-sage flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2C4031" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-editorial-ink">
            Two-factor authentication is enabled
          </p>
          <p className="text-[12px] text-editorial-ink-soft mt-0.5">
            Enrolled {enrolledLabel}. You&apos;ll be asked for a code from your authenticator app
            each time you sign in.
          </p>
        </div>
      </div>

      {/* ── Regenerate recovery codes ─────────────────────────────── */}
      {mode.kind === "regen" ? (
        <form onSubmit={handleRegenerate} className="rounded-[12px] border border-editorial-line bg-editorial-paper-2 p-4 space-y-3">
          <div>
            <p className="text-[13px] font-semibold text-editorial-ink">Regenerate recovery codes</p>
            <p className="text-[11px] text-editorial-ink-soft mt-0.5">
              Enter a fresh 6-digit code to confirm. Your existing codes will be revoked.
            </p>
          </div>
          <div>
            <label htmlFor="regen-totp" className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">
              6-digit code
            </label>
            <input
              id="regen-totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full rounded-lg border border-editorial-line text-[15px] font-mono tracking-widest px-3 py-2 focus:outline-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-[#F4E3DB] border border-[#E2C3B3] px-3 py-2">
              <p className="text-[12px] font-medium text-[#7C3D24]">{error}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition disabled:opacity-60"
            >
              {isPending ? "Generating…" : "Generate new codes"}
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="px-4 py-2 rounded-full border border-editorial-line text-[13px] font-semibold text-editorial-ink-soft hover:bg-white transition"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-[12px] border border-editorial-line bg-white p-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-editorial-ink">Recovery codes</p>
            <p className="text-[11px] text-editorial-ink-soft mt-0.5">
              Lost your codes? Generate a new set. The old set stops working immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode({ kind: "regen" });
              setError(null);
            }}
            className="px-3 py-1.5 rounded-lg border border-editorial-line text-[11px] font-semibold text-editorial-ink-soft hover:bg-editorial-paper-2 transition whitespace-nowrap"
          >
            Show new recovery codes
          </button>
        </div>
      )}

      {/* ── Disable 2FA ───────────────────────────────────────────── */}
      {isOwner ? (
        <div className="rounded-[12px] border border-[#E5D6A8] bg-[#F6EED9] p-4">
          <p className="text-[13px] font-semibold text-[#6E5C2C]">Owners must keep 2FA enabled</p>
          <p className="text-[11px] text-[#6E5C2C] mt-1 leading-relaxed">
            Owner accounts are required to have two-factor authentication turned on. If you need
            to disable it, ask another owner to promote you first, then you can disable it while
            you&apos;re a manager.
          </p>
        </div>
      ) : mode.kind === "disable" ? (
        <form onSubmit={handleDisable} className="rounded-[12px] border border-[#E2C3B3] bg-[#F4E3DB] p-4 space-y-3">
          <div>
            <p className="text-[13px] font-semibold text-[#7C3D24]">Disable two-factor authentication</p>
            <p className="text-[11px] text-[#7C3D24] mt-0.5">
              Confirm your current password to disable 2FA on this account.
            </p>
          </div>
          <div>
            <label htmlFor="disable-password" className="text-[11px] text-[#7C3D24] font-semibold block mb-1">
              Current password
            </label>
            <input
              id="disable-password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#E2C3B3] text-[13px] px-3 py-2 bg-white focus:outline-none focus:border-[#7C3D24] focus:ring-1 focus:ring-[#7C3D24]"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-white border border-[#E2C3B3] px-3 py-2">
              <p className="text-[12px] font-medium text-[#7C3D24]">{error}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-full bg-[#7C3D24] text-white text-[13px] font-semibold hover:opacity-90 transition disabled:opacity-60"
            >
              {isPending ? "Disabling…" : "Disable 2FA"}
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="px-4 py-2 rounded-full border border-[#E2C3B3] text-[13px] font-semibold text-[#7C3D24] hover:bg-white transition"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-[12px] border border-[#E2C3B3] bg-white p-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#7C3D24]">Disable 2FA</p>
            <p className="text-[11px] text-editorial-ink-soft mt-0.5">
              Turn off two-factor authentication on this account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode({ kind: "disable" });
              setError(null);
            }}
            className="px-3 py-1.5 rounded-lg border border-[#E2C3B3] text-[11px] font-semibold text-[#7C3D24] hover:bg-[#F4E3DB] transition whitespace-nowrap"
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
