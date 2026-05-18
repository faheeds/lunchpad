"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const UPGRADE_PLANS = [
  { id: "STARTER", name: "Starter", price: "$49/mo" },
  { id: "GROWTH",  name: "Growth",  price: "$149/mo" },
  { id: "SCALE",   name: "Scale",   price: "$349/mo" },
];

interface Props {
  currentPlan: string;
  subscriptionStatus: string;
  hasActiveSubscription: boolean;
  onCancelClick?: () => void;
  nextRenewalDate?: Date | null;
}

export function SubscriptionActions({
  currentPlan,
  subscriptionStatus,
  hasActiveSubscription,
  onCancelClick,
  nextRenewalDate,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always show plan options — active users can upgrade/downgrade themselves.
  // Excludes the plan they're currently on (no point selling them what they have).
  const showUpgrade = subscriptionStatus !== "PAST_DUE";
  const availablePlans = UPGRADE_PLANS.filter((p) => p.id !== currentPlan);
  const isActiveSubscriber = hasActiveSubscription && subscriptionStatus === "ACTIVE";

  async function handleUpgrade(plan: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start checkout.");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!showUpgrade) {
    return (
      <div style={{
        background: "white", borderRadius: 16, padding: "20px 24px",
        border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <p style={{ fontSize: 14, color: "#64748b" }}>
          Your subscription is active. To make changes to your plan or billing, please contact{" "}
          <a href="mailto:support@lunchpad.us" style={{ color: "#c41230", fontWeight: 600 }}>
            support@lunchpad.us
          </a>.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: "white", borderRadius: 16, padding: "24px",
      border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: "#1c0505", marginBottom: 4 }}>
        {isActiveSubscriber ? "Change your plan" : "Upgrade your plan"}
      </p>
      <p style={{ fontSize: 13, color: "#78716c", marginBottom: 20 }}>
        {isActiveSubscriber
          ? "Switch plans anytime. Stripe will prorate the difference automatically."
          : "Choose a plan to unlock full access. You can change plans anytime."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {availablePlans.map((p) => (
          <div key={p.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 16px", border: "1px solid #e5e7eb", borderRadius: 12,
          }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1c0505" }}>{p.name}</p>
              <p style={{ fontSize: 12, color: "#94a3b8" }}>{p.price}</p>
            </div>
            <button
              onClick={() => handleUpgrade(p.id)}
              disabled={loading}
              style={{
                padding: "8px 18px", borderRadius: 10,
                background: loading ? "#e5e7eb" : "#c41230",
                color: "white", fontSize: 13, fontWeight: 700,
                border: "none", cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "..." : (isActiveSubscriber ? "Switch to" : "Select")}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: "#c0392b", background: "#fff5f5", padding: "10px 14px", borderRadius: 10 }}>
          {error}
        </p>
      )}

      {isActiveSubscriber && onCancelClick && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #e5e7eb" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#78716c", marginBottom: 12 }}>
            Want to cancel?
          </p>
          <button
            onClick={onCancelClick}
            style={{
              padding: "10px 16px", borderRadius: 10,
              background: "transparent", color: "#c41230",
              fontSize: 13, fontWeight: 600,
              border: "1px solid #fecaca", cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#fee2e2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            Cancel subscription
          </button>
        </div>
      )}
    </div>
  );
}
