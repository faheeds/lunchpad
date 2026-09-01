import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { MfaEnroll } from "@/components/admin/mfa-enroll";
import { MfaManage } from "@/components/admin/mfa-manage";

/**
 * MFA / two-factor settings page.
 *
 * This is the ONE surface where an admin enrolls / regenerates codes /
 * disables 2FA on their own account. Deliberately not folded into the
 * main /admin/settings tabs page because the enrollment flow needs its
 * own component tree (QR code display, multi-step form, recovery-code
 * reveal) that doesn't compose cleanly with the tab-switching page.
 *
 * Access: any authenticated admin can manage their OWN 2FA — no role
 * gate here (that would prevent STAFF from enrolling, which we want
 * them to do). Cross-account MFA administration is a Phase 3 concern.
 *
 * The admin row is fetched fresh on every render — we don't trust
 * session claims about MFA state because the JWT could be stale
 * relative to a just-completed enrollment.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Two-factor authentication",
};

export default async function MfaSettingsPage() {
  const session = await requireAdmin();
  const adminUserId = session.user?.adminUserId;
  const restaurantId = session.user?.restaurantId;

  if (!adminUserId || !restaurantId) {
    redirect("/admin/login");
  }

  // Tenant-scoped self lookup. Both filters come from the session,
  // never from user input. See lib/MULTI_TENANT_RULES.md.
  const admin = await prisma.adminUser.findFirst({
    where: { id: adminUserId, restaurantId },
    select: {
      id: true,
      email: true,
      role: true,
      mfaEnabledAt: true,
      mfaEnrolledAt: true,
    },
  });

  if (!admin) {
    // Session references an admin that no longer exists in the tenant
    // (e.g. removed by an owner mid-session). Bounce to login so they
    // re-auth cleanly.
    redirect("/admin/login");
  }

  const isEnrolled = admin.mfaEnabledAt !== null;
  const isOwner = admin.role === "OWNER";

  return (
    <div className="space-y-5 pb-10 bg-editorial-paper min-h-screen">
      <SettingsTabs />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-editorial-ink-faint mb-1">
          <Link href="/admin/settings?tab=general" className="no-underline text-editorial-ink-faint hover:text-editorial-ink-soft">
            ← Settings
          </Link>
        </p>
        <h1 className="text-[17px] font-editorial font-semibold text-editorial-ink">
          Two-factor authentication
        </h1>
        <p className="text-[11px] text-editorial-ink-faint mt-0.5">
          Extra sign-in protection using a code from an app on your phone.
        </p>
      </div>

      <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden max-w-2xl shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
        <div className="px-4 py-3 border-b border-editorial-line bg-white flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-editorial-ink">Your account</p>
            <p className="text-[11px] text-editorial-ink-faint mt-0.5 font-mono">{admin.email}</p>
          </div>
          {isEnrolled ? (
            <span className="text-[10px] font-bold text-editorial-green bg-editorial-sage px-2 py-0.5 rounded-full">
              2FA Enabled
            </span>
          ) : (
            <span className="text-[10px] font-bold text-editorial-ink-faint bg-editorial-paper-2 px-2 py-0.5 rounded-full">
              Not enabled
            </span>
          )}
        </div>

        <div className="px-4 py-4">
          {isEnrolled ? (
            <MfaManage enrolledAt={admin.mfaEnrolledAt} isOwner={isOwner} />
          ) : (
            <MfaEnroll />
          )}
        </div>
      </div>
    </div>
  );
}
