import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { getRequestBaseUrl } from "@/lib/request-base-url";
import { sendAdminInviteEmail } from "@/lib/email/service";
import { roleLevel, type AdminRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

const INVITE_LIFETIME_DAYS = 14;

const ROLE_LABEL: Record<AdminRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
};

// ── Server actions ────────────────────────────────────────────────────────────

/**
 * Create a magic-link invitation. The inviter can only invite a role at or
 * below their own (owners can pick any role, managers can pick MANAGER or
 * STAFF). The invitee gets an email; no AdminUser is created until they
 * click the link and set their password.
 */
async function inviteAdmin(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const session = await auth();
  const inviterId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;
  const inviterRole = (session?.user as { adminRole?: AdminRole } | undefined)?.adminRole;
  if (!inviterId || !inviterRole) throw new Error("Not authenticated");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "STAFF") as AdminRole;

  if (!email || !name) throw new Error("Name and email are required");
  if (!["OWNER", "MANAGER", "STAFF"].includes(role)) throw new Error("Invalid role");

  // Role hierarchy enforcement: a manager cannot invite an owner. Compare
  // numeric levels rather than equality so adding a role mid-hierarchy
  // (e.g. SUPERADMIN above OWNER) doesn't break the rule.
  if (roleLevel(role) > roleLevel(inviterRole)) {
    throw new Error(`You cannot invite someone as ${ROLE_LABEL[role]} — your role only allows up to ${ROLE_LABEL[inviterRole as AdminRole]}.`);
  }

  // Reject if an admin already exists at this tenant with the same email —
  // the invite would be useless because acceptance would hit the unique
  // constraint and bounce them to login anyway.
  const existing = await prisma.adminUser.findFirst({
    where: { restaurantId: restaurant.id, email },
  });
  if (existing) {
    throw new Error(`${email} is already on the team.`);
  }

  // Invalidate any prior pending invites for the same email — only the
  // most recent invite is valid. Keeps a leaked old email from being
  // usable after a fresh invite is sent.
  await prisma.adminInvite.updateMany({
    where: {
      restaurantId: restaurant.id,
      email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.adminInvite.create({
    data: {
      restaurantId: restaurant.id,
      email,
      name,
      role,
      invitedById: inviterId,
      tokenHash,
      expiresAt,
    },
  });

  await logActivity({
    restaurantId: restaurant.id,
    adminUserId: inviterId,
    entityType: "ADMIN_INVITE",
    entityId: invite.id,
    action: "INVITED",
    summary: `Invited ${name} (${email}) as ${ROLE_LABEL[role]}`,
    metadata: { email, role, expiresAt: expiresAt.toISOString() },
  });

  const baseUrl = await getRequestBaseUrl();
  const acceptUrl = `${baseUrl}/admin/accept-invite?token=${rawToken}`;

  // Send the email. If delivery fails we want the inviter to know — re-throw
  // so the form surfaces the error rather than pretending the invite was
  // sent.
  await sendAdminInviteEmail({
    toEmail: email,
    inviterName: session?.user?.name ?? "A teammate",
    restaurantName: restaurant.name,
    roleLabel: ROLE_LABEL[role],
    acceptUrl,
    expiresInDays: INVITE_LIFETIME_DAYS,
  });

  revalidatePath("/admin/team");
}

/**
 * Resend a pending invitation: rotate the token, refresh the expiry, send
 * a fresh email. Useful when the recipient lost the email or the link
 * expired.
 */
async function resendInvite(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const session = await auth();
  const inviterRole = (session?.user as { adminRole?: AdminRole } | undefined)?.adminRole;
  if (!inviterRole) throw new Error("Not authenticated");

  const inviteId = String(formData.get("inviteId") || "");
  const invite = await prisma.adminInvite.findFirst({
    where: { id: inviteId, restaurantId: restaurant.id, acceptedAt: null, revokedAt: null },
    include: { invitedBy: { select: { name: true } } },
  });
  if (!invite) throw new Error("Invite not found or already accepted/cancelled");

  if (roleLevel(invite.role) > roleLevel(inviterRole)) {
    throw new Error("You don't have permission to manage this invitation.");
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: { tokenHash, expiresAt },
  });

  const baseUrl = await getRequestBaseUrl();
  const acceptUrl = `${baseUrl}/admin/accept-invite?token=${rawToken}`;

  await sendAdminInviteEmail({
    toEmail: invite.email,
    inviterName: invite.invitedBy.name,
    restaurantName: restaurant.name,
    roleLabel: ROLE_LABEL[invite.role],
    acceptUrl,
    expiresInDays: INVITE_LIFETIME_DAYS,
  });

  revalidatePath("/admin/team");
}

async function revokeInvite(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const session = await auth();
  const inviterRole = (session?.user as { adminRole?: AdminRole } | undefined)?.adminRole;
  if (!inviterRole) throw new Error("Not authenticated");

  const inviteId = String(formData.get("inviteId") || "");
  const invite = await prisma.adminInvite.findFirst({
    where: { id: inviteId, restaurantId: restaurant.id, acceptedAt: null, revokedAt: null },
  });
  if (!invite) throw new Error("Invite not found");

  if (roleLevel(invite.role) > roleLevel(inviterRole)) {
    throw new Error("You don't have permission to cancel this invitation.");
  }

  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  });

  const session2 = await auth();
  await logActivity({
    restaurantId: restaurant.id,
    adminUserId: (session2?.user as { adminUserId?: string } | undefined)?.adminUserId,
    entityType: "ADMIN_INVITE",
    entityId: invite.id,
    action: "INVITE_REVOKED",
    summary: `Cancelled invite for ${invite.email}`,
    metadata: { email: invite.email },
  });

  revalidatePath("/admin/team");
}

async function removeAdmin(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  const session = await auth();
  const adminId = String(formData.get("adminId"));

  if (session?.user?.adminUserId === adminId) throw new Error("You cannot remove yourself");

  // Last-OWNER guard — never let a tenant end up ownerless.
  const target = await prisma.adminUser.findFirst({
    where: { id: adminId, restaurantId: restaurant.id },
  });
  if (!target) throw new Error("User not found");
  if (target.role === "OWNER") {
    const ownerCount = await prisma.adminUser.count({
      where: { restaurantId: restaurant.id, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      throw new Error("Can't remove the last owner. Promote someone else to OWNER first.");
    }
  }

  await prisma.adminUser.delete({ where: { id: adminId, restaurantId: restaurant.id } });

  await logActivity({
    restaurantId: restaurant.id,
    adminUserId: session?.user?.adminUserId,
    entityType: "TEAM_MEMBER",
    entityId: adminId,
    action: "REMOVED",
    summary: `Removed ${target.name} (${target.email}) from the team`,
    metadata: { name: target.name, email: target.email, role: target.role },
  });

  revalidatePath("/admin/team");
}

async function changePassword(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  const session = await auth();
  const adminId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;
  if (!adminId) throw new Error("Not authenticated");

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!currentPassword || !newPassword) throw new Error("All fields are required");
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
  if (newPassword !== confirmPassword) throw new Error("Passwords do not match");

  const admin = await prisma.adminUser.findFirst({ where: { id: adminId, restaurantId: restaurant.id } });
  if (!admin) throw new Error("User not found");

  const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash } });
  revalidatePath("/admin/team");
}

async function changeRole(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");

  const session = await auth();
  const inviterRole = (session?.user as { adminRole?: AdminRole } | undefined)?.adminRole;
  if (!inviterRole) throw new Error("Not authenticated");

  const adminId = String(formData.get("adminId"));
  const role = String(formData.get("role")) as AdminRole;

  if (session?.user?.adminUserId === adminId) throw new Error("You cannot change your own role");
  if (!["OWNER", "MANAGER", "STAFF"].includes(role)) throw new Error("Invalid role");

  // Role hierarchy: an inviter can only assign a role <= their own. A
  // manager cannot promote anyone to OWNER.
  if (roleLevel(role) > roleLevel(inviterRole)) {
    throw new Error(`You cannot assign ${ROLE_LABEL[role]} — your role only allows up to ${ROLE_LABEL[inviterRole as AdminRole]}.`);
  }

  // Last-OWNER guard on demotion: prevent the only owner from being demoted.
  const target = await prisma.adminUser.findFirst({
    where: { id: adminId, restaurantId: restaurant.id },
  });
  if (!target) throw new Error("User not found");
  if (target.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.adminUser.count({
      where: { restaurantId: restaurant.id, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      throw new Error("Can't demote the last owner. Promote someone else to OWNER first.");
    }
  }

  await prisma.adminUser.update({ where: { id: adminId, restaurantId: restaurant.id }, data: { role } });

  await logActivity({
    restaurantId: restaurant.id,
    adminUserId: session?.user?.adminUserId,
    entityType: "TEAM_MEMBER",
    entityId: adminId,
    action: "ROLE_CHANGED",
    summary: `Changed ${target.name}'s role from ${ROLE_LABEL[target.role as AdminRole]} to ${ROLE_LABEL[role]}`,
    metadata: { name: target.name, email: target.email, from: target.role, to: role },
  });

  revalidatePath("/admin/team");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  OWNER:   { label: "Owner",   color: "#7c3aed", bg: "#f5f3ff", description: "Full access — settings, billing, team management" },
  MANAGER: { label: "Manager", color: "#0369a1", bg: "#eff6ff", description: "Menu, schedule, reports, orders, invite staff" },
  STAFF:   { label: "Staff",   color: "#374151", bg: "#f9fafb", description: "View and manage orders only" },
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function fmtRelative(d: Date | null): string {
  if (!d) return "Never";
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminTeamPage() {
  const [restaurant, session] = await Promise.all([requireRestaurant(), auth()]);
  // Managers can now see/use the team page (to invite staff/managers).
  // Staff are still kept out — they don't manage the team.
  await requireAdminRole("MANAGER");

  const currentAdminRole = (session?.user as { adminRole?: AdminRole } | undefined)?.adminRole;
  const isOwner = currentAdminRole === "OWNER";

  const [team, pendingInvites] = await Promise.all([
    prisma.adminUser.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.adminInvite.findMany({
      where: {
        restaurantId: restaurant.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { invitedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const currentAdminId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;

  // Avatar palette based on name hash
  const AVATARS = ["#c41230", "#7c3aed", "#0369a1", "#059669", "#d97706", "#db2777"];
  function avatarColor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return AVATARS[Math.abs(h) % AVATARS.length];
  }

  // Role options visible in the invite + role-change selects, capped to the
  // current user's role level so they can't pick something they're not
  // allowed to assign.
  const assignableRoles: AdminRole[] = isOwner
    ? ["STAFF", "MANAGER", "OWNER"]
    : ["STAFF", "MANAGER"];

  return (
    <div className="space-y-5 pb-10">

      {/* Settings tab bar — Team is now a sub-tab of Settings. */}
      <SettingsTabs />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[17px] font-semibold text-ink">Team</h1>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {team.length} member{team.length !== 1 ? "s" : ""}
          {pendingInvites.length > 0 && (
            <> · {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? "s" : ""}</>
          )}
        </p>
      </div>

      {/* ── Role legend ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
          <div key={key} style={{ background: cfg.bg, borderRadius: 12, padding: "10px 12px", border: `1px solid ${cfg.color}22` }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
            <p style={{ fontSize: 10, color: "#6b7280", marginTop: 3, lineHeight: 1.4 }}>{cfg.description}</p>
          </div>
        ))}
      </div>

      {/* ── Team list ──────────────────────────────────────────────── */}

      {team.length > 0 && (

        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden divide-y divide-slate-50">
        {team.map((member) => {
          const cfg = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.STAFF;
          const isSelf = member.id === currentAdminId;
          const color = avatarColor(member.name);
          const canManageThisRow =
            !isSelf && roleLevel(member.role) <= roleLevel(currentAdminRole);

          return (
            <div key={member.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: color, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white",
                }}>
                  {initials(member.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-ink">{member.name}</p>
                    {isSelf && (
                      <span className="text-[10px] text-slate-400 font-medium">(you)</span>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: cfg.color, background: cfg.bg,
                      borderRadius: 100, padding: "2px 8px",
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {member.email}
                    <span className="text-slate-300 mx-1">·</span>
                    Joined {fmtDate(member.createdAt)}
                    <span className="text-slate-300 mx-1">·</span>
                    Last active {fmtRelative(member.lastActiveAt)}
                  </p>
                </div>
              </div>

              {/* Actions — only for others, and only if current role can manage them */}
              {canManageThisRow && (
                <div className="flex items-center gap-2 mt-3 pl-[50px]">
                  <form action={changeRole} className="flex items-center gap-1.5 flex-1">
                    <input type="hidden" name="adminId" value={member.id} />
                    <select
                      name="role"
                      defaultValue={member.role}
                      className="flex-1 rounded-lg border border-slate-200 text-[11px] py-1.5 px-2 max-w-[140px]"
                    >
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                    <button type="submit"
                      className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition whitespace-nowrap">
                      Change role
                    </button>
                  </form>

                  {isOwner && (
                    <form action={removeAdmin}>
                      <input type="hidden" name="adminId" value={member.id} />
                      <ConfirmButton
                        message={`Remove ${member.name} from the team?`}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-red-100 text-red-500 font-semibold hover:bg-red-50 transition whitespace-nowrap">
                        Remove
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {team.length === 0 && (
        <EmptyState
          icon="users"
          title="No team members yet."
          description="Invite your team members to start collaborating."
        />
      )}

      {/* ── Pending invitations ────────────────────────────────────── */}
      {pendingInvites.length > 0 && (
        <div className="rounded-[14px] border border-amber-100 bg-amber-50/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-100/80">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              Pending invitations
            </p>
          </div>
          <div className="divide-y divide-amber-100/60">
            {pendingInvites.map((invite) => {
              const cfg = ROLE_CONFIG[invite.role] ?? ROLE_CONFIG.STAFF;
              const canManageThisInvite = roleLevel(invite.role) <= roleLevel(currentAdminRole);
              return (
                <div key={invite.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-semibold text-ink">{invite.name ?? invite.email}</p>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: cfg.color, background: cfg.bg,
                          borderRadius: 100, padding: "2px 8px",
                        }}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {invite.email}
                        <span className="text-slate-300 mx-1">·</span>
                        Invited by {invite.invitedBy.name}
                        <span className="text-slate-300 mx-1">·</span>
                        Expires {fmtDate(invite.expiresAt)}
                      </p>
                    </div>
                    {canManageThisInvite && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <form action={resendInvite}>
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <button type="submit"
                            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition whitespace-nowrap">
                            Resend
                          </button>
                        </form>
                        <form action={revokeInvite}>
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <ConfirmButton
                            message={`Cancel the invite for ${invite.email}?`}
                            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-red-100 text-red-500 font-semibold hover:bg-red-50 transition whitespace-nowrap">
                            Cancel
                          </ConfirmButton>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Change my password ─────────────────────────────────────── */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Change my password
          </span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>
        <form action={changePassword} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">Current password</label>
            <input type="password" name="currentPassword" required placeholder="Your current password"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">New password</label>
            <input type="password" name="newPassword" required minLength={8} placeholder="Min 8 characters"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">Confirm new password</label>
            <input type="password" name="confirmPassword" required minLength={8} placeholder="Repeat new password"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-slate-800 text-white text-[13px] font-semibold">
            Update password
          </button>
        </form>
      </details>

      {/* ── Invite team member (magic link) ────────────────────────── */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Invite team member
          </span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>

        <form action={inviteAdmin} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            We&apos;ll email a magic link that expires in {INVITE_LIFETIME_DAYS} days. The invitee
            sets their own name and password when they accept — you don&apos;t need to share a
            password.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Full name</label>
              <input type="text" name="name" required placeholder="Jane Smith"
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Role</label>
              <select name="role" defaultValue="STAFF"
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]} — {ROLE_CONFIG[r].description}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">Email address</label>
            <input type="email" name="email" required placeholder="jane@example.com"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Send invitation
          </button>
        </form>
      </details>
    </div>
  );
}
