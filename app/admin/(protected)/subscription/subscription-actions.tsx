"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CancelSubscriptionModal } from "@/components/admin/cancel-subscription-modal";

const UPGRADE_PLANS = [
  { id: "STARTER", name: "Starter", price: "$49/mo" },
  { id: "GROWTH",  name: "Growth",  price: "$149/mo" },
  { id: "SCALE",   name: "Scale",   price: "$349/mo" },
];

interface Props {
  currentPlan: string;
  subscriptionStatus: string;
  hasActiveSubscription: boolean;
  renewalDate?: string;
}

export function SubscriptionActions({ currentPlan, subscriptionStatus, hasActiveSubscription, renewalDate }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }

  if (!showUpgrade) {
    return (
      <>
        <div style={{
          background: "white", borderRadius: 16, padding: "20px 24px",
          border: "1px solid #E3DBC6", boxShadow: "0 18px 44px -22px rgba(33,29,21,0.20)",
        }}>
          <p style={{ fontSize: 14, color: "#5B5446", marginBottom: 16 }}>
            Your subscription is active. To make changes to your plan or billing, please contact{" "}
            <a href="mailto:support@lunchpad.us" style={{ color: "#2C4031", fontWeight: 600 }}>
              support@lunchpad.us
            </a>.
          </p>
          <button
            onClick={() => setShowCancelModal(true)}
            style={{
              padding: "10px 16px", borderRadius: 20,
              background: "transparent", color: "#7C3D24",
              fontSize: 13, fontWeight: 600, border: "1px solid #E2C3B3",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            Cancel subscription
          </button>
        </div>
        <CancelSubscriptionModal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancel}
          renewalDate={renewalDate ?? "your renewal date"}
          isLoading={loading}
        />
      </>
    );
  }

  return (
    <>
      <div style={{
        background: "white", borderRadius: 16, padding: "24px",
        border: "1px solid #E3DBC6", boxShadow: "0 18px 44px -22px rgba(33,29,21,0.20)",
      }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#211D15", marginBottom: 4 }}>
          {isActiveSubscriber ? "Change your plan" : "Upgrade your plan"}
        </p>
        <p style={{ fontSize: 13, color: "#5B5446", marginBottom: 20 }}>
          {isActiveSubscriber
            ? "Switch plans anytime. Stripe will prorate the difference automatically."
            : "Choose a plan to unlock full access. You can change plans anytime."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {availablePlans.map((p) => (
            <div key={p.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 16px", border: "1px solid #E3DBC6", borderRadius: 12,
            }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#211D15" }}>{p.name}</p>
                <p style={{ fontSize: 12, color: "#938B78" }}>{p.price}</p>
              </div>
              <button
                onClick={() => handleUpgrade(p.id)}
                disabled={loading}
                style={{
                  padding: "8px 18px", borderRadius: 20,
                  background: loading ? "#E3DBC6" : "#2C4031",
                  color: loading ? "#5B5446" : "#F6F1E6", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "..." : (isActiveSubscriber ? "Switch to" : "Select")}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "#7C3D24", background: "#F4E3DB", padding: "10px 14px", borderRadius: 10, marginBottom: 16, border: "1px solid #E2C3B3" }}>
            {error}
          </p>
        )}

        {isActiveSubscriber && (
          <button
            onClick={() => setShowCancelModal(true)}
            style={{
              width: "100%", padding: "10px 16px", borderRadius: 20,
              background: "transparent", color: "#7C3D24",
              fontSize: 13, fontWeight: 600, border: "1px solid #E2C3B3",
              cursor: "pointer", transition: "all 0.15s", marginTop: 8,
            }}
          >
            Cancel subscription
          </button>
        )}
      </div>
      <CancelSubscriptionModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancel}
        renewalDate={renewalDate ?? "your renewal date"}
        isLoading={loading}
      />
    </>
  );
}
