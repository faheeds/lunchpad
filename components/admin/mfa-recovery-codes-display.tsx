"use client";

import { useMemo, useState } from "react";

/**
 * Displays a batch of freshly-issued recovery codes exactly once.
 *
 * These codes are the ONLY time the plaintext exists client-side —
 * once the user dismisses this view they cannot be retrieved. The
 * component enforces the "I've saved these codes" acknowledgment
 * before the parent's `onDone` handler can be invoked.
 *
 * Not stored to localStorage / sessionStorage. Only rendered into
 * the DOM of a client component; a browser refresh loses them.
 */
export function MfaRecoveryCodesDisplay({
  codes,
  onDone,
  title = "Save your recovery codes",
  subtitle = "Each code works once. Store them somewhere safe — a password manager works well. If you lose access to your authenticator app, these are the only way back into your account.",
}: {
  codes: string[];
  onDone: () => void;
  title?: string;
  subtitle?: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  // Precomputed .txt payload — small enough that the memo is basically
  // cosmetic, but keeps the render logic clean.
  const txtContent = useMemo(() => {
    const generatedAt = new Date().toISOString();
    return [
      "LunchPad — Two-Factor Recovery Codes",
      `Generated: ${generatedAt}`,
      "",
      "Each code works exactly once. If you lose access to your",
      "authenticator app, use one of these codes to sign in.",
      "",
      ...codes,
      "",
    ].join("\n");
  }, [codes]);

  function handleCopy() {
    // navigator.clipboard is HTTPS-only. In the dev/preview flow the
    // fallback branch never runs; still worth having so a local http://
    // preview doesn't silently no-op.
    const text = codes.join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        },
        () => {
          // Best effort — the codes are still visible on screen.
        },
      );
    }
  }

  function handleDownload() {
    // Blob + object URL is the cleanest cross-browser way to trigger a
    // file download without a round-trip to the server. Revoked
    // immediately after click so we don't leak URLs across enrollments.
    const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lunchpad-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[15px] font-semibold text-editorial-ink">{title}</p>
        <p className="text-[12px] text-editorial-ink-soft mt-1 leading-relaxed">{subtitle}</p>
      </div>

      <div className="rounded-[12px] border border-editorial-line bg-editorial-paper-2 p-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[13px] text-editorial-ink">
          {codes.map((code, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-editorial-ink-faint w-5 text-right">{i + 1}.</span>
              <span>{code}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-2 rounded-full border border-editorial-line text-[12px] font-semibold text-editorial-ink-soft bg-white hover:bg-editorial-paper-2 transition"
        >
          Download as .txt
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-2 rounded-full border border-editorial-line text-[12px] font-semibold text-editorial-ink-soft bg-white hover:bg-editorial-paper-2 transition"
        >
          {copied ? "Copied!" : "Copy all"}
        </button>
      </div>

      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[12px] text-editorial-ink-soft">
          I&apos;ve saved these codes somewhere I can access without my authenticator app.
        </span>
      </label>

      <button
        type="button"
        disabled={!acknowledged}
        onClick={onDone}
        className={`w-full py-2.5 rounded-full text-[13px] font-semibold transition ${
          acknowledged
            ? "bg-editorial-green text-editorial-paper hover:bg-editorial-green-deep"
            : "bg-editorial-line text-editorial-ink-faint cursor-not-allowed"
        }`}
      >
        Done
      </button>
    </div>
  );
}
