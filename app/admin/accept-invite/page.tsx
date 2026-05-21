import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { logActivity } from "@/lib/activity";

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

  const newAdmin = await prisma.$transaction(async (tx) => {
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

    return admin;
  });

  await logActivity({
    restaurantId: invite.restaurantId,
    adminUserId: newAdmin.id, // self-event — the new admin accepted
    entityType: "TEAM_MEMBER",
    entityId: newAdmin.id,
    action: "INVITE_ACCEPTED",
    summary: `${newAdmin.name} (${newAdmin.email}) accepted invite as ${invite.role}`,
    metadata: { inviteId: invite.id, role: invite.role },
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
    <div className="min-h-screen bg-editorial-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="flex justify-center mb-3.5">
            <svg width="44" height="44" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="9" fill="#2C4031"/><g transform="translate(6.4 5.6) scale(0.8)" fill="none" stroke="#F6F1E6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M3 12a9 9 0 0 0 18 0"/><path d="M12 7v-2"/><path d="M9 5h6"/></g></svg>
          </div>
          <h1 className="font-editorial text-[25px] font-medium text-editorial-ink leading-tight">
            {restaurant?.name ? `${restaurant.name} Admin` : "LunchPad Admin"}
          </h1>
          <p className="text-[12.5px] text-editorial-ink-soft mt-1.5">
            {invite ? "Set up your account" : "Invitation"}
          </p>
        </div>

        <div className="rounded-[20px] border border-editorial-line bg-white p-7 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          {!invite ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#F4E3DB] border border-[#E2C3B3] px-3.5 py-3 text-[12.5px] text-[#7C3D24]">
                {ERROR_MESSAGES.invalid}
              </div>
              <Link href="/admin/login" className="block w-full text-center py-3 rounded-full border border-editorial-line text-editorial-ink text-[13px] font-semibold no-underline hover:border-editorial-green hover:text-editorial-green transition-colors">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form action={acceptInvite} className="space-y-3.5">
              <input type="hidden" name="token" value={token} />

              <div className="rounded-xl bg-editorial-paper border border-editorial-line px-3.5 py-3 text-[12px] text-editorial-ink-soft">
                <p>
                  <strong className="text-editorial-ink">{invite.inviterName}</strong> invited you to join{" "}
                  <strong className="text-editorial-ink">{invite.restaurantName}</strong> as{" "}
                  <strong className="text-editorial-ink">{ROLE_LABEL[invite.role] ?? invite.role}</strong>.
                </p>
                <p className="mt-1">Email: {invite.email}</p>
              </div>

              <div>
                <label className="text-[11px] font-medium text-editorial-ink-soft mb-1 block">Your name</label>
                <input type="text" name="name" required defaultValue={invite.name ?? ""} autoComplete="name"
                  className="w-full rounded-xl border border-editorial-line text-[13px] px-3.5 py-2.5 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green outline-none"
                  placeholder="Jane Smith" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-editorial-ink-soft mb-1 block">Set a password</label>
                <input type="password" name="password" required minLength={8} autoComplete="new-password"
                  className="w-full rounded-xl border border-editorial-line text-[13px] px-3.5 py-2.5 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green outline-none"
                  placeholder="At least 8 characters" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-editorial-ink-soft mb-1 block">Confirm password</label>
                <input type="password" name="confirm" required minLength={8} autoComplete="new-password"
                  className="w-full rounded-xl border border-editorial-line text-[13px] px-3.5 py-2.5 text-editorial-ink focus:border-editorial-green focus:ring-1 focus:ring-editorial-green outline-none"
                  placeholder="Re-enter password" />
              </div>

              {errorMessage && (
                <p className="rounded-xl bg-[#F4E3DB] border border-[#E2C3B3] px-3.5 py-2.5 text-[12px] text-[#7C3D24]">{errorMessage}</p>
              )}

              <button type="submit" className="w-full py-3 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition-colors mt-1">
                Create account
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
