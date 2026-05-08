import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

/**
 * Consume a reset token and update the admin's password.
 *
 * Returns nothing — on success the user is redirected to /admin/login?reset=1.
 * On failure we redirect back with an `error` query param so the UI can
 * render a useful message without throwing into the boundary.
 */
async function applyReset(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) redirect("/admin/login");
  if (password.length < 8) {
    redirect(`/admin/reset-password?token=${encodeURIComponent(token)}&error=short`);
  }
  if (password !== confirm) {
    redirect(`/admin/reset-password?token=${encodeURIComponent(token)}&error=mismatch`);
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Find by hash, ensure unused, ensure not expired. Pull the admin in the
  // same query so we can update their password atomically.
  const record = await prisma.adminPasswordResetToken.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    redirect("/admin/reset-password?error=invalid");
  }

  // 12 rounds matches the rest of the codebase (signup, team add-member,
  // admin password change). Keep these in sync so a rehash on login isn't
  // required when a password is updated through this flow.
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: record.adminUserId },
      data: { passwordHash },
    }),
    prisma.adminPasswordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Best-effort: invalidate any other unused tokens for this admin so a
    // separate leaked email can't still be used.
    prisma.adminPasswordResetToken.updateMany({
      where: { adminUserId: record.adminUserId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/admin/login?reset=1");
}

const ERROR_MESSAGES: Record<string, string> = {
  short:    "Password must be at least 8 characters.",
  mismatch: "Passwords don't match.",
  invalid:  "This reset link has expired or already been used. Request a new one below.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const restaurant = await getCurrentRestaurant();
  const token = params.token ?? "";
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "" : "";

  // No token at all → bounce to the request form. We don't pre-validate the
  // token here (one DB hit per pageview is fine but unnecessary); validation
  // happens on submit, which keeps invalid tokens from echoing back any
  // information about whether they exist.
  if (!token && !params.error) {
    redirect("/admin/forgot-password");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[20px] font-semibold text-ink">
            {restaurant?.name ? `${restaurant.name} Admin` : "LunchPad Admin"}
          </h1>
          <p className="text-[12px] text-slate-500 mt-1">Choose a new password</p>
        </div>

        <div className="rounded-[20px] border border-slate-100 bg-white p-6">
          {params.error === "invalid" ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-[13px] text-red-900">
                {ERROR_MESSAGES.invalid}
              </div>
              <Link
                href="/admin/forgot-password"
                className="block w-full text-center py-3 rounded-xl bg-ink text-white text-[13px] font-semibold no-underline"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <form action={applyReset} className="space-y-3">
              <input type="hidden" name="token" value={token} />
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">New password</label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2.5"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Confirm new password</label>
                <input
                  type="password"
                  name="confirm"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2.5"
                  placeholder="Re-enter password"
                />
              </div>
              {errorMessage && (
                <p className="text-[12px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{errorMessage}</p>
              )}
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-ink text-white text-[13px] font-semibold mt-1"
              >
                Update password
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
