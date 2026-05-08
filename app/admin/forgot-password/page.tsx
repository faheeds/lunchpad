import Link from "next/link";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { getRequestBaseUrl } from "@/lib/request-base-url";
import { sendAdminPasswordResetEmail } from "@/lib/email/service";

export const dynamic = "force-dynamic";

const RESET_TOKEN_LIFETIME_MINUTES = 60;

/**
 * Issues a password reset link for the email + current tenant. Always
 * returns the same neutral confirmation message regardless of whether
 * the email matches an admin — this prevents the form from being used
 * to enumerate which emails belong to which restaurant.
 *
 * Steps:
 *   1. Validate basic email shape (server-side).
 *   2. Resolve the tenant from the request (subdomain).
 *   3. Look up the AdminUser scoped to that tenant.
 *   4. If found: invalidate older unused tokens, mint a new one, email it.
 *   5. Always redirect to ?sent=1 so the UI shows the same success state.
 */
async function requestReset(formData: FormData) {
  "use server";

  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  // Cheapest possible email shape check — full validation lives in the
  // model and the server will simply not find a match for malformed input.
  if (!rawEmail || !rawEmail.includes("@")) {
    return;
  }

  // Restaurant context comes purely from the subdomain header. If a user
  // somehow submits this form from the apex, just no-op silently — the
  // page renders a guidance card in that case and the form isn't there.
  const restaurant = await getCurrentRestaurant();
  if (!restaurant) return;

  const baseUrl = await getRequestBaseUrl();

  const admin = await prisma.adminUser.findFirst({
    where: { email: rawEmail, restaurantId: restaurant.id },
  });

  if (admin) {
    // Mint a 32-byte random token. We only persist its SHA-256 hash, so a
    // DB read can't recover live reset URLs; the raw token only ever
    // appears in the outgoing email.
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_LIFETIME_MINUTES * 60 * 1000);

    // Invalidate any older unused tokens so the most recent link is the
    // only one that works — limits damage from a leaked old email.
    await prisma.adminPasswordResetToken.updateMany({
      where: { adminUserId: admin.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.adminPasswordResetToken.create({
      data: {
        adminUserId: admin.id,
        tokenHash,
        expiresAt,
      },
    });

    const resetUrl = `${baseUrl}/admin/reset-password?token=${rawToken}`;

    try {
      await sendAdminPasswordResetEmail({
        toEmail: admin.email,
        adminName: admin.name || "there",
        restaurantName: restaurant.name,
        resetUrl,
        expiresInMinutes: RESET_TOKEN_LIFETIME_MINUTES,
      });
    } catch (err) {
      // Log but don't surface — same neutral UI either way to avoid
      // leaking which email is registered.
      console.error("[admin-password-reset] send failed:", err);
    }
  }
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;
  const restaurant = await getCurrentRestaurant();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[20px] font-semibold text-ink">
            {restaurant?.name ? `${restaurant.name} Admin` : "LunchPad Admin"}
          </h1>
          <p className="text-[12px] text-slate-500 mt-1">Reset your admin password</p>
        </div>

        <div className="rounded-[20px] border border-slate-100 bg-white p-6">
          {!restaurant ? (
            // Apex / unknown host — admins reset from their own subdomain.
            // Showing the form here would be useless because we wouldn't
            // know which tenant's AdminUser to look up.
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-3 text-[13px] text-amber-900">
                Open your restaurant&apos;s admin URL (e.g. <code className="bg-white/60 rounded px-1">your-restaurant.lunchpad.us/admin/forgot-password</code>) and request the reset from there. Each admin account is tied to its restaurant.
              </div>
              <Link
                href="/admin/login"
                className="block w-full text-center py-3 rounded-xl bg-ink text-white text-[13px] font-semibold no-underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : params.sent ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-green-50 border border-green-100 px-3 py-3 text-[13px] text-green-900">
                If an admin account exists for that email, we&apos;ve sent a password reset link. Check your inbox — the link expires in {RESET_TOKEN_LIFETIME_MINUTES} minutes.
              </div>
              <Link
                href="/admin/login"
                className="block w-full text-center py-3 rounded-xl bg-ink text-white text-[13px] font-semibold no-underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form
              action={async (formData) => {
                "use server";
                await requestReset(formData);
                const { redirect } = await import("next/navigation");
                redirect("/admin/forgot-password?sent=1");
              }}
              className="space-y-3"
            >
              <p className="text-[12px] text-slate-500">
                Enter the email tied to your admin account. We&apos;ll send a reset link that expires in {RESET_TOKEN_LIFETIME_MINUTES} minutes.
              </p>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2.5"
                  placeholder="admin@example.com"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-ink text-white text-[13px] font-semibold mt-1"
              >
                Send reset link
              </button>
              <Link
                href="/admin/login"
                className="block text-center text-[12px] text-slate-500 mt-3 no-underline"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
