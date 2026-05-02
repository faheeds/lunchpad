"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CancelOrderButtonProps {
  orderId: string;
  orderNumber: string;
  amountCents: number;
}

export function CancelOrderButton({ orderId, orderNumber, amountCents }: CancelOrderButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);

  async function handleCancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel order.");
      setShowConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (showConfirm) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: "0 0 env(safe-area-inset-bottom, 0)",
        }}
        onClick={() => !loading && setShowConfirm(false)}
      >
        <div
          style={{
            background: "white", borderRadius: "20px 20px 0 0",
            width: "100%", maxWidth: 480, padding: "28px 24px 32px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{
            fontSize: 17, fontWeight: 700, color: "#1c0505",
            marginBottom: 8, textAlign: "center",
          }}>
            Cancel order?
          </p>
          <p style={{
            fontSize: 13, color: "#78716c", textAlign: "center",
            lineHeight: 1.5, marginBottom: 6,
          }}>
            Order <strong>{orderNumber}</strong> will be cancelled and{" "}
            <strong>{formatted}</strong> will be refunded to your original payment
            method within 5-10 business days.
          </p>

          {error && (
            <p style={{
              fontSize: 12, color: "#c0392b", textAlign: "center",
              marginBottom: 10, padding: "8px 12px",
              background: "#fff5f5", borderRadius: 8,
            }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
            <button
              onClick={handleCancel}
              disabled={loading}
              style={{
                width: "100%", padding: "14px", borderRadius: 12,
                background: loading ? "#e5e7eb" : "#c0392b",
                color: "white", fontSize: 15, fontWeight: 700,
                border: "none", cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Cancelling…" : "Yes, cancel & refund"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              style={{
                width: "100%", padding: "14px", borderRadius: 12,
                background: "transparent", color: "#78716c",
                fontSize: 15, fontWeight: 600,
                border: "1px solid #e5e7eb", cursor: "pointer",
              }}
            >
              Keep order
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      style={{
        fontSize: 11, color: "#c0392b", fontWeight: 600,
        background: "none", border: "none", cursor: "pointer",
        padding: 0, marginTop: 4, display: "block",
      }}
    >
      Cancel order
    </button>
  );
}
