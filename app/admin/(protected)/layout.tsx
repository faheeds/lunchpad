import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { requireAdmin } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { prisma } from "@/lib/db";

// Pages that bypass the setup-completion check
const SETUP_EXEMPT = ["/admin/setup", "/admin/onboarding", "/admin/subscription"];

/**
 * Quick step-completion count for the nav pill. Mirrors the logic in the
 * wizard page itself (app/admin/(protected)/onboarding/page.tsx).
 * Returns null when the operator has marked onboarding complete.
 */
async function computeOnboardingPill(full: {
  id: string;
  operatorType: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  stripeOnboardingComplete: boolean;
  testOrderPlacedAt: Date | null;
  kitchenSheetSendHour: number | null;
  onboardingShareAcked: boolean;
  onboardingComplete: boolean;
} | null): Promise<{ done: number; total: number } | null> {
  if (!full) return null;
  if (full.onboardingComplete) return null;

  const [locationCount, menuItemCount, deliveryDateCount, teamCount] = await Promise.all([
    prisma.school.count({ where: { restaurantId: full.id, isActive: true } }),
    prisma.menuItem.count({ where: { restaurantId: full.id, isActive: true } }),
    prisma.deliveryDate.count({
      where: { school: { restaurantId: full.id }, deliveryDate: { gte: new Date() } },
    }),
    prisma.adminUser.count({ where: { restaurantId: full.id } }),
  ]);

  const checks = [
    Boolean(full.operatorType),
    Boolean(full.logoUrl || full.heroImageUrl),
    full.stripeOnboardingComplete,
    locationCount > 0,
    menuItemCount >= 3,
    deliveryDateCount > 0,
    teamCount > 1,
    Boolean(full.testOrderPlacedAt),
    full.kitchenSheetSendHour !== null && full.kitchenSheetSendHour !== undefined,
    full.onboardingShareAcked,
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  const adminRole = session.user?.adminRole ?? "STAFF";

  const restaurant = await requireRestaurant();

  // ── Subscription gating ─────────────────────────────────────────────────
  let full: Awaited<ReturnType<typeof prisma.restaurant.findUnique>> | null = null;
  try {
    full = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
  } catch {
    // Migration not yet applied — skip subscription gating
  }

  if (full) {
    const isCancelled = full.subscriptionStatus === "CANCELLED";
    const isExpiredTrial =
      full.subscriptionStatus === "TRIAL" &&
      full.trialEndsAt !== null &&
      new Date() > full.trialEndsAt;

    if (isCancelled || isExpiredTrial) {
      return (
        <div className="min-h-screen bg-editorial-paper flex items-center justify-center px-4">
          <div style={{
            background: "white", borderRadius: 20, padding: "40px 32px",
            maxWidth: 420, width: "100%", textAlign: "center",
            border: "1px solid #E3DBC6",
            boxShadow: "0 18px 44px -22px rgba(33,29,21,0.20)",
          }}>
            <p style={{ fontSize: 32, marginBottom: 16 }}>🔒</p>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, fontWeight: 500, color: "#211D15", marginBottom: 8 }}>
              {isCancelled ? "Subscription cancelled" : "Trial expired"}
            </h1>
            <p style={{ fontSize: 14, color: "#5B5446", lineHeight: 1.6, marginBottom: 28 }}>
              {isCancelled
                ? "Your LunchPad subscription has been cancelled. Reactivate to regain access."
                : "Your 14-day free trial has ended. Choose a plan to continue using LunchPad."}
            </p>
            <Link href="/admin/subscription" style={{
              display: "block", padding: "14px", borderRadius: 100,
              background: "#2C4031", color: "#F6F1E6",
              fontWeight: 600, fontSize: 15, textDecoration: "none",
            }}>
              View plans
            </Link>
          </div>
        </div>
      );
    }
  }

  // ── Setup completion check ───────────────────────────────────────────────
  // The new onboarding wizard owns this signal via Restaurant.onboardingComplete.
  // If the operator has finished the wizard (even with optional steps skipped),
  // we trust their decision and let them into the rest of the admin. The legacy
  // "must have schools + menu + dates" check is now only a fallback for old
  // restaurants whose onboardingComplete flag isn't set yet.
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const isSetupExempt = SETUP_EXEMPT.some((p) => pathname.startsWith(p));

  if (!isSetupExempt && !full?.onboardingComplete) {
    const [schoolCount, menuCount, dateCount] = await Promise.all([
      prisma.school.count({ where: { restaurantId: restaurant.id, isActive: true } }),
      prisma.menuItem.count({ where: { restaurantId: restaurant.id, isActive: true } }),
      prisma.deliveryDate.count({
        where: { school: { restaurantId: restaurant.id }, deliveryDate: { gte: new Date() } }
      }),
    ]);

    if (schoolCount === 0 || menuCount === 0 || dateCount === 0) {
      redirect("/admin/onboarding");
    }
  }

  // ── Trial days remaining warning ─────────────────────────────────────────
  const trialDaysLeft = full?.subscriptionStatus === "TRIAL" && full.trialEndsAt
    ? Math.ceil((full.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="min-h-screen bg-editorial-paper">
      {/* Past-due warning */}
      {full?.subscriptionStatus === "PAST_DUE" && (
        <div style={{
          background: "#F4E3DB", borderBottom: "1px solid #E2C3B3",
          padding: "10px 16px", textAlign: "center", fontSize: 13, color: "#7C3D24",
        }}>
          Your last payment failed.{" "}
          <Link href="/admin/subscription" style={{ fontWeight: 700, color: "#7C3D24" }}>
            Update billing
          </Link>{" "}
          to avoid losing access.
        </div>
      )}
      {/* Trial expiry warning (≤ 3 days) */}
      {trialDaysLeft !== null && trialDaysLeft <= 3 && (
        <div style={{
          background: "#F6EED9", borderBottom: "1px solid #E5D6A8",
          padding: "10px 16px", textAlign: "center", fontSize: 13, color: "#6E5C2C",
        }}>
          {trialDaysLeft === 0 ? "Your trial expires today." : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial.`}{" "}
          <Link href="/admin/subscription" style={{ fontWeight: 700, color: "#6E5C2C" }}>
            Upgrade now
          </Link>
        </div>
      )}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <AdminNav adminRole={adminRole} restaurantSlug={restaurant.slug} onboardingPill={await computeOnboardingPill(full as any)} />
      <div className="max-w-7xl mx-auto px-4 py-4">
        <Breadcrumbs />
        {children}
      </div>
    </div>
  );
}
