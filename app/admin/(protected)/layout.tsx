import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { prisma } from "@/lib/db";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  const adminRole = session.user?.adminRole ?? "STAFF";

  const restaurant = await requireRestaurant();
  const full = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });

  // Hard block: cancelled subscription or expired trial
  if (full) {
    const isCancelled = full.subscriptionStatus === "CANCELLED";
    const isExpiredTrial =
      full.subscriptionStatus === "TRIAL" &&
      full.trialEndsAt !== null &&
      new Date() > full.trialEndsAt;

    if (isCancelled || isExpiredTrial) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
          <div style={{
            background: "white", borderRadius: 20, padding: "40px 32px",
            maxWidth: 420, width: "100%", textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
          }}>
            <p style={{ fontSize: 32, marginBottom: 16 }}>🔒</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1c0505", marginBottom: 8 }}>
              {isCancelled ? "Subscription cancelled" : "Trial expired"}
            </h1>
            <p style={{ fontSize: 14, color: "#78716c", lineHeight: 1.6, marginBottom: 28 }}>
              {isCancelled
                ? "Your LunchPad subscription has been cancelled. Reactivate to regain access."
                : "Your 14-day free trial has ended. Choose a plan to continue using LunchPad."}
            </p>
            <Link
              href="/admin/subscription"
              style={{
                display: "block", padding: "14px", borderRadius: 12,
                background: "#c41230", color: "white",
                fontWeight: 700, fontSize: 15, textDecoration: "none",
              }}
            >
              View plans
            </Link>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Past-due warning banner */}
      {full?.subscriptionStatus === "PAST_DUE" && (
        <div style={{
          background: "#fef2f2", borderBottom: "1px solid #fecaca",
          padding: "10px 16px", textAlign: "center",
          fontSize: 13, color: "#991b1b",
        }}>
          Your last payment failed.{" "}
          <Link href="/admin/subscription" style={{ fontWeight: 700, color: "#991b1b" }}>
            Update billing
          </Link>{" "}
          to avoid losing access.
        </div>
      )}
      {/* Trial expiry warning */}
      {full?.subscriptionStatus === "TRIAL" && full.trialEndsAt && (() => {
        const daysLeft = Math.ceil((full.trialEndsAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysLeft <= 3 ? (
          <div style={{
            background: "#fefce8", borderBottom: "1px solid #fde68a",
            padding: "10px 16px", textAlign: "center",
            fontSize: 13, color: "#854d0e",
          }}>
            {daysLeft === 0 ? "Your trial expires today." : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial.`}{" "}
            <Link href="/admin/subscription" style={{ fontWeight: 700, color: "#854d0e" }}>
              Upgrade now
            </Link>
          </div>
        ) : null;
      })()}
      <AdminNav adminRole={adminRole} />
      <div className="max-w-7xl mx-auto px-4 py-4">
        {children}
      </div>
    </div>
  );
}
