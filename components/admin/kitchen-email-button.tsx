"use client";

import { useState } from "react";

export function KitchenEmailButton({
  deliveryDateId,
  contactEmail,
}: {
  deliveryDateId: string;
  contactEmail: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSend() {
    if (state === "sending") return;
    setState("sending");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/kitchen-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryDateId }),
      });
      const data = await res.json().catch(() => ({ error: "Server error" }));
      if (!res.ok) {
        setState("error");
        setErrorMsg(data.error ?? "Failed to send.");
      } else {
        setState("sent");
        setTimeout(() => setState("idle"), 4000);
      }
    } catch {
      setState("error");
      setErrorMsg("Network error. Please try again.");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSend}
        disabled={state === "sending" || state === "sent"}
        className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition"
        style={{
          borderColor: state === "sent" ? "#DEE2CF" : state === "error" ? "#E2C3B3" : "#E3DBC6",
          background: state === "sent" ? "#DEE2CF" : state === "error" ? "#F4E3DB" : "white",
          color: state === "sent" ? "#2C4031" : state === "error" ? "#7C3D24" : "#5B5446",
          opacity: state === "sending" ? 0.7 : 1,
        }}
      >
        {state === "sending" ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Sending…
          </>
        ) : state === "sent" ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Sent!
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Email kitchen sheet
          </>
        )}
      </button>
      {state === "sent" && (
        <p className="text-[10px] text-editorial-green">Sent to {contactEmail}</p>
      )}
      {state === "error" && errorMsg && (
        <p className="text-[10px] text-[#7C3D24]">{errorMsg}</p>
      )}
    </div>
  );
}
