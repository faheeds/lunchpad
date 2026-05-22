"use client";

/**
 * Self-service actions on the post-checkout success page.
 *
 * - Cancel & refund — calls /api/orders/{id}/cancel which runs
 *   cancelOrderWithRefund (Stripe refund + status update + email). Only
 *   available before the delivery date's cutoff.
 * - Contact restaurant — mailto: and tel: links rendered when the operator
 *   has set those in Settings → General.
 *
 * Modify-an-order isn't exposed here yet because the underlying flow is
 * "cancel + reorder" rather than a true edit. We instead point parents at
 * the restaurant's contact info; they can also reorder for a different day
 * via "Order another day" below.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderSelfService({
  orderId,
  /** Signed HMAC token minted server-side on the success page. Lets
   *  guests (no parent account) cancel an order they just placed. The
   *  server treats this as the authorization proof when there's no
   *  parent session; for authenticated parents the token is redundant
   *  but harmless. Token expires after 30 days; cutoffAt is still the
   *  hard ceiling on actual cancellability. */
  cancelToken,
  cutoffAt,
  restaurantName,
  contactEmail,
  contactPhone,
}: {
  orderId: string;
  cancelToken: string;
  cutoffAt: string; // ISO string from server
  restaurantName: string;
  contactEmail: string | null;
  contactPhone: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const cutoffPassed = new Date() >= new Date(cutoffAt);
  const phoneTel = contactPhone ? contactPhone.replace(/[^+\d]/g, "") : null;

  async function handleCancel() {
    if (!confirm(`Cancel this order and refund the full amount? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cancelToken }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Cancel failed (${res.status})`);
      setDone(true);
      // Bring them to history after a beat so they can confirm the cancellation landed.
      setTimeout(() => router.push("/history"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel — try again or contact the restaurant.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{
        background: "#DEE2CF", border: "1px solid #C0AFA0", borderRadius: 14,
        padding: "14px 16px", marginTop: 12, textAlign: "center",
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#2C4031", marginBottom: 2 }}>
          Order cancelled — refund issued
        </p>
        <p style={{ fontSize: 12, color: "#2C4031" }}>
          The refund will return to your card within 5-10 business days. Taking you to your history…
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: "#FCFAF3", borderRadius: 14, border: "1px solid #E3DBC6",
      padding: "14px 16px", marginTop: 12,
    }}>
      <p style={{
        fontSize: 11, fontWeight: 700, color: "#2C4031",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10,
      }}>
        ✓ You can edit or cancel until the delivery cutoff
      </p>

      {/* Contact-restaurant chips */}
      {(contactEmail || contactPhone) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Order question: ${orderId.slice(-8)}`)}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 12px", borderRadius: 10,
                background: "#F6F1E6", border: "1px solid #E3DBC6",
                fontSize: 12, color: "#211D15", textDecoration: "none", fontWeight: 600,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Email {restaurantName}
            </a>
          )}
          {contactPhone && phoneTel && (
            <a
              href={`tel:${phoneTel}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 12px", borderRadius: 10,
                background: "#F6F1E6", border: "1px solid #E3DBC6",
                fontSize: 12, color: "#211D15", textDecoration: "none", fontWeight: 600,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Call {contactPhone}
            </a>
          )}
        </div>
      )}

      {/* Cancel button — only before cutoff */}
      {cutoffPassed ? (
        <p style={{ fontSize: 12, color: "#938B78", lineHeight: 1.5 }}>
          The ordering cutoff for this delivery has passed. To cancel or change this order,{" "}
          please contact <strong style={{ color: "#211D15" }}>{restaurantName}</strong>{" "}
          {contactEmail || contactPhone ? "using the buttons above." : "directly."}
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            style={{
              display: "block", width: "100%",
              padding: "10px 12px", borderRadius: 10,
              background: "transparent",
              border: "1px solid #F4E3DB", color: "#7C3D24",
              fontSize: 12, fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
              transition: "background 120ms",
            }}
          >
            {busy ? "Cancelling…" : "Cancel order & refund"}
          </button>
          {error && (
            <p style={{ fontSize: 11, color: "#7C3D24", marginTop: 6 }}>{error}</p>
          )}
        </>
      )}
    </div>
  );
}
