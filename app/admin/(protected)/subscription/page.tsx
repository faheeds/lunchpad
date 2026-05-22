import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { prisma } from "@/lib/db";
import { SubscriptionActions } from "./subscription-actions";
import { planSummary, PLAN_LIMITS } from "@/lib/plans";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { SubscriptionPlanToggle } from "@/components/admin/subscription-plan-toggle";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<string, { name: string; price: string; description: string }> = {
  FREE:    { name: "Free",    price: "$0/mo",    description: "Limited access" },
  STARTER: { name: "Starter", price: "$49/mo",   description: "1 location" },
  GROWTH:  { name: "Growth",  price: "$149/mo",  description: "Up to 5 locations" },
  SCALE:   { name: "Scale",   price: "$349/mo",  description: "Unlimited locations" },
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  TRIAL:     { label: "Free trial",   color: "#6E5C2C", bg: "#F6EED9" },
  ACTIVE:    { label: "Active",       color: "#2C4031", bg: "#DEE2CF" },
  PAST_DUE:  { label: "Payment due",  color: "#7C3D24", bg: "#F4E3DB" },
  CANCELLED: { label: "Cancelled",    color: "#938B78", bg: "#EFE8D7" },
  PAUSED:    { label: "Paused",       color: "#938B78", bg: "#EFE8D7" },
};


export const metadata: Metadata = {
  title: "Subscription",
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

  const renewalDate = full.subscriptionStatus === "TRIAL" && full.trialEndsAt
    ? new Date(full.trialEndsAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "your renewal date";

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
    <div className="min-h-screen bg-editorial-paper">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Settings tab bar — Subscription is now a sub-tab of Settings called "Plan". */}
        <div className="mb-6 -mx-4 px-4">
          <SettingsTabs />
        </div>

        <h1 className="text-xl font-editorial font-semibold text-editorial-ink mb-1">Plan</h1>
        <p className="text-sm text-editorial-ink-faint mb-8">Manage your LunchPad plan and billing.</p>

        {justActivated && (
          <div style={{
            background: "#DEE2CF", border: "1px solid #2C4031",
            borderRadius: 12, padding: "14px 18px", marginBottom: 24,
            fontSize: 14, color: "#2C4031", fontWeight: 600,
          }}>
            Your subscription is now active. Thank you!
          </div>
        )}

      {/* Current plan card with annual/monthly toggle */}
      <SubscriptionPlanToggle
        planName={planInfo.name}
        monthlyPrice={PLAN_LIMITS[full.plan].priceMonthly}
        description={planInfo.description}
        status={statusInfo.label}
        statusColor={statusInfo.color}
        statusBg={statusInfo.bg}
      />

      {full.subscriptionStatus === "TRIAL" && (
        <div style={{
          background: trialExpired ? "#F4E3DB" : "#F6EED9",
          borderRadius: 10, padding: "12px 14px", fontSize: 13,
          color: trialExpired ? "#7C3D24" : "#6E5C2C",
          marginBottom: 24,
          borderColor: trialExpired ? "#E2C3B3" : "#E5D6A8",
          borderWidth: "1px",
        }}>
          {trialExpired
            ? "Your free trial has expired. Add a payment method to continue using LunchPad."
            : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} remaining in your free trial.`}
        </div>
      )}

      {full.subscriptionStatus === "PAST_DUE" && (
        <div style={{
          background: "#F4E3DB", borderRadius: 10, padding: "12px 14px",
          fontSize: 13, color: "#7C3D24", marginBottom: 24,
          borderColor: "#E2C3B3",
          borderWidth: "1px",
        }}>
          Your last payment failed. Please update your billing information to avoid losing access.
        </div>
      )}

      {/* Usage meter */}
      <div style={{
        background: "white", borderRadius: 16, padding: "20px 22px",
        border: "1px solid #E3DBC6", marginBottom: 24,
        boxShadow: "0 18px 44px -22px rgba(33,29,21,0.20)",
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#938B78", marginBottom: 12 }}>
          Usage this month
        </p>
        <div className="space-y-3">
          {usage.rows.map((row) => {
            const pct = row.limit === null ? 0 : Math.min(100, Math.round((row.used / row.limit) * 100));
            const isUnlimited = row.limit === null;
            const atLimit = !isUnlimited && row.used >= (row.limit ?? 0);
            const isAmber = !isUnlimited && pct >= 80 && pct < 100;
            const isRed = !isUnlimited && pct >= 100;
            return (
              <div key={row.resource}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-medium text-ink">{row.label}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!isUnlimited && (
                      <p className="text-[12px] font-semibold tabular-nums" style={{
                        color: isRed ? "#7C3D24" : isAmber ? "#C99A3F" : "#211D15"
                      }}>
                        {pct}%
                      </p>
                    )}
                    <p className="text-[12px] font-semibold tabular-nums" style={{
                      color: isRed ? "#7C3D24" : isAmber ? "#C99A3F" : "#211D15"
                    }}>
                      {row.used}{isUnlimited ? "" : ` / ${row.limit}`}
                    </p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#EFE8D7" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: isUnlimited ? "100%" : `${pct}%`,
                      background: isUnlimited
                        ? "linear-gradient(90deg, #2C4031, #4A6047)"
                        : isRed ? "#7C3D24" : isAmber ? "#C99A3F" : "#2C4031",
                    }}
                  />
                </div>
                {atLimit && (
                  <p className="text-[10px] text-[#7C3D24] mt-1">At limit — upgrade to add more.</p>
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
        renewalDate={renewalDate}
      />
      </div>
    </div>
  );
}
