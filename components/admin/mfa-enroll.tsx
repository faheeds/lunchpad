"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { startEnrollment, confirmEnrollment } from "@/app/admin/(protected)/settings/mfa/actions";
import { MfaRecoveryCodesDisplay } from "./mfa-recovery-codes-display";

/**
 * Client-side enrollment flow.
 *
 * State machine:
 *   idle       → user has landed on the "not enrolled" card; sees intro
 *                copy + Enable button.
 *   scanning   → server issued a secret + otpauth URL; user is scanning
 *                the QR code and about to submit their first TOTP code.
 *                The secret lives in this component's state — NOT in
 *                localStorage / sessionStorage / URL. Reload = start over.
 *   recovery   → server verified the code and returned the plaintext
 *                recovery codes. User must acknowledge saving them
 *                before we surrender them.
 *
 * Why the secret lives client-side between phases: it's the standard
 * TOTP enrollment two-round trip. Storing it in a "pending secret"
 * DB column would create the exact orphaned-state problem we're
 * trying to avoid. In-memory only means a reload = restart, which
 * is fine — the user just scans again.
 */
type State =
  | { kind: "idle" }
  | { kind: "scanning"; secret: string; otpauthUrl: string; qrDataUrl: string | null }
  | { kind: "recovery"; codes: string[] };

export function MfaEnroll() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Render the QR code as a data URL whenever we enter the `scanning`
  // state. `qrcode` is dynamically imported into the client bundle by
  // way of this ESM import; it works fine in the browser and doesn't
  // need any server calls.
  useEffect(() => {
    if (state.kind !== "scanning" || state.qrDataUrl) return;
    let cancelled = false;
    QRCode.toDataURL(state.otpauthUrl, { margin: 1, width: 200 }).then(
      (dataUrl) => {
        if (cancelled) return;
        setState((s) => (s.kind === "scanning" ? { ...s, qrDataUrl: dataUrl } : s));
      },
      () => {
        // QR render failure is non-fatal — the manual-entry secret is
        // still visible below. Show a note in the error slot.
        if (!cancelled) setError("Couldn't render the QR code. Use manual entry below.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state]);

  async function handleStart() {
    setError(null);
    startTransition(async () => {
      try {
        const { secret, otpauthUrl } = await startEnrollment();
        setState({ kind: "scanning", secret, otpauthUrl, qrDataUrl: null });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "scanning") return;
    setError(null);

    // Client-side format guard so we don't waste a server round-trip on
    // obviously-bad input. The server re-validates.
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    // Capture the secret up-front so it can't change between the
    // TypeScript narrowing check and the actual call.
    const secret = state.secret;

    startTransition(async () => {
      try {
        const { recoveryCodes } = await confirmEnrollment(secret, normalized);
        setState({ kind: "recovery", codes: recoveryCodes });
        setCode("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function handleDone() {
    // A router.refresh is enough — the server component re-fetches and
    // will re-render as the "enrolled / manage" view because the DB
    // now has mfaEnabledAt set.
    router.refresh();
  }

  if (state.kind === "recovery") {
    return (
      <MfaRecoveryCodesDisplay
        codes={state.codes}
        onDone={handleDone}
      />
    );
  }

  if (state.kind === "scanning") {
    return (
      <form onSubmit={handleConfirm} className="space-y-4">
        <div>
          <p className="text-[15px] font-semibold text-editorial-ink">Scan the QR code</p>
          <p className="text-[12px] text-editorial-ink-soft mt-1 leading-relaxed">
            Open Google Authenticator, 1Password, Authy, or any other TOTP app and scan
            the code below. Then type the 6-digit code your app shows.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="rounded-[12px] border border-editorial-line bg-white p-3 flex-shrink-0">
            {state.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, no next/image transform benefit
              <img src={state.qrDataUrl} alt="Scan with your authenticator app" width={200} height={200} />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center text-[11px] text-editorial-ink-faint">
                Generating QR…
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-[11px] text-editorial-ink-soft font-semibold mb-1">
                Can&apos;t scan? Enter this secret manually:
              </p>
              <code className="block break-all rounded-lg border border-editorial-line bg-editorial-paper-2 px-2.5 py-2 text-[12px] font-mono text-editorial-ink">
                {state.secret}
              </code>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="mfa-code" className="text-[11px] text-editorial-ink-soft font-semibold block mb-1">
            6-digit code from your app
          </label>
          <input
            id="mfa-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
            {isPending ? "Verifying…" : "Verify and enable"}
          </button>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "idle" });
              setCode("");
              setError(null);
            }}
            className="px-4 py-2 rounded-full border border-editorial-line text-[13px] font-semibold text-editorial-ink-soft hover:bg-editorial-paper-2 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // idle
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[15px] font-semibold text-editorial-ink">
          Add an extra layer of protection
        </p>
        <p className="text-[12px] text-editorial-ink-soft mt-1 leading-relaxed">
          Two-factor authentication uses a code from an app on your phone in addition
          to your password. Even if someone gets your password, they can&apos;t sign in
          without your device.
        </p>
      </div>

      <ul className="space-y-1.5 text-[12px] text-editorial-ink-soft">
        {[
          "Works with Google Authenticator, 1Password, Authy, and other TOTP apps.",
          "You'll get 10 single-use recovery codes to save somewhere safe.",
          "You can turn it off later from this page (owners require another owner's help).",
        ].map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-editorial-ink-faint mt-1.5 flex-shrink-0" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {error && (
        <div className="rounded-lg bg-[#F4E3DB] border border-[#E2C3B3] px-3 py-2">
          <p className="text-[12px] font-medium text-[#7C3D24]">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={isPending}
        className="px-4 py-2 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition disabled:opacity-60"
      >
        {isPending ? "Starting…" : "Enable 2FA"}
      </button>
    </div>
  );
}
