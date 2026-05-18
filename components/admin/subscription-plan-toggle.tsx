"use client";

import { useState } from "react";

interface Props {
  planName: string;
  monthlyPrice: number;
  description: string;
  status: string;
  statusColor: string;
  statusBg: string;
}

export function SubscriptionPlanToggle({
  planName,
  monthlyPrice,
  description,
  status,
  statusColor,
  statusBg,
}: Props) {
  const [isAnnual, setIsAnnual] = useState(false);

  const annualPrice = Math.floor(monthlyPrice * 12 * 0.8);
  const displayPrice = isAnnual ? `$${annualPrice}` : `$${monthlyPrice}`;
  const displayPeriod = isAnnual ? "/year" : "/mo";

  return (
    <div style={{
      background: "white", borderRadius: 16, padding: "24px",
      border: "1px solid #e5e7eb", marginBottom: 24,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 4 }}>
            Current plan
          </p>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#1c0505" }}>{planName}</p>
          <p style={{ fontSize: 13, color: "#78716c" }}>{displayPrice}{displayPeriod} &middot; {description}</p>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
          background: statusBg, color: statusColor,
        }}>
          {status}
        </span>
      </div>

      {/* Annual/Monthly Toggle */}
      <div style={{
        display: "flex", gap: 8, background: "#f8fafc",
        padding: "6px 8px", borderRadius: 8, width: "fit-content",
      }}>
        <button
          onClick={() => setIsAnnual(false)}
          style={{
            padding: "6px 14px", borderRadius: 6,
            background: !isAnnual ? "white" : "transparent",
            color: !isAnnual ? "#1D9E75" : "#94a3b8",
            fontSize: 12, fontWeight: 600, border: "none",
            cursor: "pointer", transition: "all 0.15s",
            boxShadow: !isAnnual ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
          }}
        >
          Monthly
        </button>
        <button
          onClick={() => setIsAnnual(true)}
          style={{
            padding: "6px 14px", borderRadius: 6,
            background: isAnnual ? "white" : "transparent",
            color: isAnnual ? "#1D9E75" : "#94a3b8",
            fontSize: 12, fontWeight: 600, border: "none",
            cursor: "pointer", transition: "all 0.15s",
            boxShadow: isAnnual ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            position: "relative",
          }}
        >
          Annual
          {isAnnual && (
            <span style={{
              position: "absolute", right: -26, top: -6,
              background: "#22c55e", color: "white",
              fontSize: 9, fontWeight: 700, padding: "2px 6px",
              borderRadius: 10, whiteSpace: "nowrap",
            }}>
              Save 20%
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
