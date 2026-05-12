import { requireAdmin } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { prisma } from "@/lib/db";
import { SubscriptionActions } from "./subscription-actions";
import { planSummary } from "@/lib/plans";
import { SettingsTabs } from "@/components/admin/settings-tabs";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<string, { name: string; price: string; description: string }> = {
  FREE:    { name: "Free",    price: "$0/mo",    description: "Limited access" },
  STARTER: { name: "Starter", price: "$49/mo",   description: "1 location" },
  GROWTH:  { name: "Growth",  price: "$149/mo",  description: "Up to 5 locations" },
  SCALE:   { name: "Scale",   price: "$349/mo",  description: "Unlimited locations" },
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  TRIAL:     { label: "Free trial",   color: "#854d0e", bg: "#fef9c3" },
  ACTIVE:    { label: "Active",       color: "#166534", bg: "#dcfce7" },
  PAST_DUE:  { label: "Payment due",  color: "#991b1b", bg: "#fee2e2" },
  CANCELLED: { label: "Cancelled",    color: "#64748b", bg: "#f1f5f9" },
  PAUSED:    { label: "Paused",       color: "#64748b", bg: "#f1f5f9" },
};

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  await requireAdmin();
  const restaurant = await requireRestaurant();
  const full = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
  if (!full) return null;

  const params = await searchParams;
  const justActivated = params.success === "1";

  const planInfo = PLAN_LABELS[full.plan] ?? PLAN_LABELS.FREE;
  const statusInfo = STATUS_LABELS[full.subscriptionStatus] ?? STATUS_LABELS.CANCELLED;

  const trialDaysLeft = full.trialEndsAt
    ? Math.max(0, Math.ceil((full.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const trialExpired = full.subscriptionStatus === "TRIAL" && trialDaysLeft === 0;

  // Usage meter: count active locations, team seats, paid orders this month.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [locationCount, teamSeatCount, ordersThisMonth] = await Promise.all([
    prisma.school.count({ where: { restaurantId: full.id, isActive: true } }),
    prisma.adminUser.count({ where: { restaurantId: full.id } }),
    prisma.order.count({
      where: { restaurantId: full.id, status: "PAID", createdAt: { gte: monthStart } },
    }),
  ]);
  const usage = planSummary(full.plan, {
    locations: locationCount,
    teamSeats: teamSeatCount,
    ordersThisMonth,
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Settings tab bar — Subscription is now a sub-tab of Settings called "Plan". */}
      <div className="mb-6 -mx-4 px-4">
        <SettingsTabs />
      </div>

      <h1 className="text-xl font-bold text-slate-800 mb-1">Plan</h1>
      <p className="text-sm text-slate-500 mb-8">Manage your LunchPad plan and billing.</p>

      {justActivated && (
        <div style={{
          background: "#dcfce7", border: "1px solid #86efac",
          borderRadius: 12, padding: "14px 18px", marginBottom: 24,
          fontSize: 14, color: "#166534", fontWeight: 600,
        }}>
          Your subscription is now active. Thank you!
        </div>
      )}

      {/* Current plan card */}
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
            <p style={{ fontSize: 22, fontWeight: 800, color: "#1c0505" }}>{planInfo.name}</p>
            <p style={{ fontSize: 13, color: "#78716c" }}>{planInfo.price} &middot; {planInfo.description}</p>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
            background: statusInfo.bg, color: statusInfo.color,
          }}>
            {statusInfo.label}
          </span>
        </div>

        {full.subscriptionStatus === "TRIAL" && (
          <div style={{
            background: trialExpired ? "#fff5f5" : "#fefce8",
            borderRadius: 10, padding: "12px 14px", fontSize: 13,
            color: trialExpired ? "#991b1b" : "#854d0e",
          }}>
            {trialExpired
              ? "Your free trial has expired. Add a payment method to continue using LunchPad."
              : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} remaining in your free trial.`}
          </div>
        )}

        {full.subscriptionStatus === "PAST_DUE" && (
          <div style={{
            background: "#fff5f5", borderRadius: 10, padding: "12px 14px",
            fontSize: 13, color: "#991b1b",
          }}>
            Your last payment failed. Please update your billing information to avoid losing access.
          </div>
        )}
      </div>

      {/* Usage meter */}
      <div style={{
        background: "white", borderRadius: 16, padding: "20px 22px",
        border: "1px solid #e5e7eb", marginBottom: 24,
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 12 }}>
          Usage this month
        </p>
        <div className="space-y-3">
          {usage.rows.map((row) => {
            const pct = row.limit === null ? 0 : Math.min(100, Math.round((row.used / row.limit) * 100));
            const isUnlimited = row.limit === null;
            const atLimit = !isUnlimited && row.used >= (row.limit ?? 0);
            return (
              <div key={row.resource}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-medium text-ink">{row.label}</p>
                  <p className="text-[12px] font-semibold tabular-nums" style={{ color: atLimit ? "#dc2626" : "#1c0505" }}>
                    {row.used}{isUnlimited ? "" : ` / ${row.limit}`}
                  </p>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#f1f5f9" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: isUnlimited ? "100%" : `${pct}%`,
                      background: isUnlimited
                        ? "linear-gradient(90deg, #10b981, #34d399)"
                        : atLimit ? "#dc2626" : pct > 80 ? "#f59e0b" : "#10b981",
                    }}
                  />
                </div>
                {atLimit && (
                  <p className="text-[10px] text-red-600 mt-1">At limit — upgrade to add more.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upgrade / manage section */}
      <SubscriptionActions
        currentPlan={full.plan}
        subscriptionStatus={full.subscriptionStatus}
        hasActiveSubscription={!!full.stripeSubscriptionId}
      />
    </div>
  );
}
