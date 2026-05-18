"use client";

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
  const displayPrice = `$${monthlyPrice}`;
  const displayPeriod = "/mo";

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

    </div>
  );
}
