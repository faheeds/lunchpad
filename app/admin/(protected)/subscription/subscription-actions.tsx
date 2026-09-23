"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CancelSubscriptionModal } from "@/components/admin/cancel-subscription-modal";

// Mirrors lib/plans.ts's PLAN_LIMITS (server-only, not importable from a
// client component). Keep these two in sync if limits ever change.
const UPGRADE_PLANS = [
  {
    id: "STARTER", name: "Starter", price: "$49/mo",
    tagline: "One school or office — perfect to get started.",
    features: ["1 location", "Up to 3 team seats", "500 orders / month", "All core features included"],
  },
  {
    id: "GROWTH", name: "Growth", price: "$149/mo", badge: "Most popular",
    tagline: "Room to grow across multiple sites.",
    features: ["Up to 5 locations", "Up to 10 team seats", "5,000 orders / month", "All core features included"],
  },
  {
    id: "SCALE", name: "Scale", price: "$349/mo",
    tagline: "For multi-site operators who've outgrown the caps.",
    features: ["Unlimited locations", "Unlimited team seats", "Unlimited orders", "All core features included"],
  },
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
  const showUpgrade = subscriptionStatus !== "PAST_DUE";
  const isActiveSubscriber = hasActiveSubscription && subscriptionStatus === "ACTIVE";
  // Only hide the current plan from the list once they're actually paying for
  // it — "switching to" the plan you're already subscribed to makes no sense.
  // But a trial user hasn't paid for anything yet: currentPlan there is just
  // the plan they'll land on when they subscribe, so it must stay selectable,
  // or someone whose trial plan was Growth only ever sees Starter/Scale —
  // an accidental downgrade or upsell with no way to just pay for what they
  // were already trialing.
  const availablePlans = isActiveSubscriber
    ? UPGRADE_PLANS.filter((p) => p.id !== currentPlan)
    : UPGRADE_PLANS;

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
          {isActiveSubscriber ? "Change your plan" : "Choose your plan"}
        </p>
        <p style={{ fontSize: 13, color: "#5B5446", marginBottom: 20 }}>
          {isActiveSubscriber
            ? "Switch plans anytime. Stripe will prorate the difference automatically."
            : "Choose a plan to unlock full access. You can change plans anytime."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {availablePlans.map((p) => (
            <div key={p.id} style={{
              position: "relative",
              padding: "18px 18px 16px",
              border: p.badge ? "1.5px solid #2C4031" : "1px solid #E3DBC6",
              borderRadius: 14,
              background: p.badge ? "#FAF7EE" : "white",
            }}>
              {p.badge && (
                <span style={{
                  position: "absolute", top: -10, left: 16,
                  background: "#2C4031", color: "#F6F1E6",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  padding: "3px 10px", borderRadius: 999,
                }}>
                  {p.badge}
                </span>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#211D15" }}>{p.name}</p>
                  <p style={{ fontSize: 12, color: "#5B5446", marginTop: 1 }}>{p.tagline}</p>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#211D15", whiteSpace: "nowrap", marginLeft: 12 }}>
                  {p.price}
                </p>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 5 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#3D3728" }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                      background: "#DEE2CF", color: "#2C4031",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, lineHeight: 1,
                    }}>
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(p.id)}
                disabled={loading}
                style={{
                  width: "100%", padding: "9px 18px", borderRadius: 20,
                  background: loading ? "#E3DBC6" : "#2C4031",
                  color: loading ? "#5B5446" : "#F6F1E6", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "..." : (isActiveSubscriber ? `Switch to ${p.name}` : `Select ${p.name}`)}
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
