"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CancelSubscriptionModalProps {
  nextRenewalDate?: Date | null;
  onClose: () => void;
}

export function CancelSubscriptionModal({ nextRenewalDate, onClose }: CancelSubscriptionModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renewalDateStr = nextRenewalDate
    ? new Date(nextRenewalDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "your next renewal date";

  async function handleCancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel subscription.");
      router.push("/admin/subscription");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50,
    }}>
      <div style={{
        background: "white", borderRadius: 16, padding: "24px",
        maxWidth: 420, width: "calc(100% - 32px)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#1c0505", marginBottom: 12 }}>
          Cancel subscription?
        </p>
        <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
          Canceling stops future renewals on <strong>{renewalDateStr}</strong>. Your account stays active until then. Are you sure?
        </p>

        {error && (
          <p style={{
            fontSize: 13, color: "#c0392b", background: "#fff5f5",
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 10,
              background: "#f1f5f9", color: "#64748b",
              fontSize: 13, fontWeight: 600,
              border: "none", cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#e2e8f0";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9";
            }}
          >
            Keep subscription
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 10,
              background: loading ? "#fecaca" : "#dc2626",
              color: "white",
              fontSize: 13, fontWeight: 600,
              border: "none", cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#b91c1c";
            }}
            onMouseLeave={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#dc2626";
            }}
          >
            {loading ? "Canceling..." : "Yes, cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
