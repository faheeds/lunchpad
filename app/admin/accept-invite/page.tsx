import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

/**
 * Accept-invite flow. The invitee lands here from an email link with
 * `?token=...` in the URL. We never trust the token blindly — every server
 * action below revalidates it (lookup by hash, check expiry, check not
 * already used, check not revoked) before mutating any state.
 *
 * Two outcomes:
 *  1. Invite is valid → render a form for the invitee to set name + password
 *  2. Invite is invalid/expired/used/revoked → render a friendly error and
 *     point them to /admin/login (they may already have an account)
 */

async function acceptInvite(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) redirect("/admin/login");
  if (!name) {
    redirect(`/admin/accept-invite?token=${encodeURIComponent(token)}&error=name`);
  }
  if (password.length < 8) {
    redirect(`/admin/accept-invite?token=${encodeURIComponent(token)}&error=short`);
  }
  if (password !== confirm) {
    redirect(`/admin/accept-invite?token=${encodeURIComponent(token)}&error=mismatch`);
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const invite = await prisma.adminInvite.findUnique({
    where: { tokenHash },
  });

  if (
    !invite ||
    invite.acceptedAt ||
    invite.revokedAt ||
    invite.expiresAt < new Date()
  ) {
    redirect("/admin/accept-invite?error=invalid");
  }

  // The DB unique index on (restaurantId, email) means we can't create a
  // duplicate admin row — surface that as a clear error rather than a
  // raw Prisma constraint violation.
  const existing = await prisma.adminUser.findFirst({
    where: { restaurantId: invite.restaurantId, email: invite.email },
  });
  if (existing) {
    // Mark the invite consumed so it can't be reused, even though we
    // didn't create a new admin (the invitee already has access).
    await prisma.adminInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedAdminId: existing.id },
    });
    redirect("/admin/login?invited=existing");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    const admin = await tx.adminUser.create({
      data: {
        restaurantId: invite.restaurantId,
        email: invite.email,
        name,
        role: invite.role,
        passwordHash,
      },
    });

    await tx.adminInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedAdminId: admin.id },
    });
  });

  redirect("/admin/login?invited=1");
}

const ERROR_MESSAGES: Record<string, string> = {
  short:    "Password must be at least 8 characters.",
  mismatch: "Passwords don't match.",
  name:     "Please enter your name.",
  invalid:  "This invite link has expired, was cancelled, or has already been used. Ask the inviter to send a new one.",
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const restaurant = await getCurrentRestaurant();
  const token = params.token ?? "";
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "" : "";

  // Pre-validate the token so we can show the role + email + restaurant
  // name in the UI. We only reveal it after the token checks pass, so
  // someone hitting this page with a guessed token gets the same blank
  // "invalid" state as someone with a stale token.
  let invite: {
    email: string;
    name: string | null;
    role: "OWNER" | "MANAGER" | "STAFF";
    inviterName: string;
    restaurantName: string;
  } | null = null;

  if (token && params.error !== "invalid") {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const found = await prisma.adminInvite.findUnique({
      where: { tokenHash },
      include: {
        invitedBy: { select: { name: true } },
        restaurant: { select: { name: true } },
      },
    });
    if (
      found &&
      !found.acceptedAt &&
      !found.revokedAt &&
      found.expiresAt >= new Date()
    ) {
      invite = {
        email: found.email,
        name: found.name,
        role: found.role,
        inviterName: found.invitedBy.name,
        restaurantName: found.restaurant.name,
      };
    }
  }

  // No token, no usable invite, and no error in flight → bounce to login.
  // This catches stale bookmarks of the bare /admin/accept-invite URL.
  if (!token && !params.error) {
    redirect("/admin/login");
  }

  const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", MANAGER: "Manager", STAFF: "Staff" };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[20px] font-semibold text-ink">
            {restaurant?.name ? `${restaurant.name} Admin` : "LunchPad Admin"}
          </h1>
          <p className="text-[12px] text-slate-500 mt-1">
            {invite ? "Set up your account" : "Invitation"}
          </p>
        </div>

        <div className="rounded-[20px] border border-slate-100 bg-white p-6">
          {!invite ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-[13px] text-red-900">
                {ERROR_MESSAGES.invalid}
              </div>
              <Link
                href="/admin/login"
                className="block w-full text-center py-3 rounded-xl bg-ink text-white text-[13px] font-semibold no-underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form action={acceptInvite} className="space-y-3">
              <input type="hidden" name="token" value={token} />

              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-[12px] text-slate-700">
                <p>
                  <strong>{invite.inviterName}</strong> invited you to join{" "}
                  <strong>{invite.restaurantName}</strong> as{" "}
                  <strong>{ROLE_LABEL[invite.role] ?? invite.role}</strong>.
                </p>
                <p className="mt-1 text-slate-500">Email: {invite.email}</p>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Your name</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={invite.name ?? ""}
                  autoComplete="name"
                  className="w-full rounded-xl border-slate-200 text-[13px] px-3 py-2.5"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Set a password</label>
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
                <label className="text-[11px] text-slate-500 mb-1 block">Confirm password</label>
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
                Create account
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
