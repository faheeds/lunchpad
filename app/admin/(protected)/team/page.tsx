import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { ConfirmButton } from "@/components/admin/confirm-button";

export const dynamic = "force-dynamic";

// ── Server actions ────────────────────────────────────────────────────────────

async function inviteAdmin(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const email    = String(formData.get("email")    || "").trim().toLowerCase();
  const name     = String(formData.get("name")     || "").trim();
  const role     = String(formData.get("role")     || "STAFF") as "OWNER" | "MANAGER" | "STAFF";
  const password = String(formData.get("password") || "").trim();

  if (!email || !name || !password) throw new Error("All fields are required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.create({
    data: { restaurantId: restaurant.id, email, name, role, passwordHash },
  });
  revalidatePath("/admin/team");
}

async function removeAdmin(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  const session  = await auth();
  const adminId  = String(formData.get("adminId"));

  if (session?.user?.adminUserId === adminId) throw new Error("You cannot remove yourself");
  await prisma.adminUser.delete({ where: { id: adminId, restaurantId: restaurant.id } });
  revalidatePath("/admin/team");
}

async function changePassword(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  const session = await auth();
  const adminId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;
  if (!adminId) throw new Error("Not authenticated");

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword     = String(formData.get("newPassword")     || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!currentPassword || !newPassword) throw new Error("All fields are required");
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
  if (newPassword !== confirmPassword) throw new Error("Passwords do not match");

  // Tenant-scoped: belt-and-braces, since adminId is from the session anyway
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
  await requireAdminRole("OWNER");
  const session = await auth();
  const adminId = String(formData.get("adminId"));
  const role    = String(formData.get("role")) as "OWNER" | "MANAGER" | "STAFF";

  if (session?.user?.adminUserId === adminId) throw new Error("You cannot change your own role");
  await prisma.adminUser.update({ where: { id: adminId, restaurantId: restaurant.id }, data: { role } });
  revalidatePath("/admin/team");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  OWNER:   { label: "Owner",   color: "#7c3aed", bg: "#f5f3ff", description: "Full access — settings, billing, team management" },
  MANAGER: { label: "Manager", color: "#0369a1", bg: "#eff6ff", description: "Menu, schedule, reports, orders" },
  STAFF:   { label: "Staff",   color: "#374151", bg: "#f9fafb", description: "View and manage orders only" },
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminTeamPage() {
  const [restaurant, session] = await Promise.all([requireRestaurant(), auth()]);
  await requireAdminRole("OWNER");

  const team = await prisma.adminUser.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const currentAdminId = (session?.user as { adminUserId?: string } | undefined)?.adminUserId;

  // Avatar palette based on name hash
  const AVATARS = ["#c41230", "#7c3aed", "#0369a1", "#059669", "#d97706", "#db2777"];
  function avatarColor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return AVATARS[Math.abs(h) % AVATARS.length];
  }

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[17px] font-semibold text-ink">Team</h1>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {team.length} member{team.length !== 1 ? "s" : ""}
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
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden divide-y divide-slate-50">
        {team.map((member) => {
          const cfg    = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.STAFF;
          const isSelf = member.id === currentAdminId;
          const color  = avatarColor(member.name);

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
                  </p>
                </div>
              </div>

              {/* Actions — only for others */}
              {!isSelf && (
                <div className="flex items-center gap-2 mt-3 pl-[50px]">
                  <form action={changeRole} className="flex items-center gap-1.5 flex-1">
                    <input type="hidden" name="adminId" value={member.id} />
                    <select name="role" defaultValue={member.role}
                      className="flex-1 rounded-lg border border-slate-200 text-[11px] py-1.5 px-2 max-w-[140px]">
                      <option value="STAFF">Staff</option>
                      <option value="MANAGER">Manager</option>
                      <option value="OWNER">Owner</option>
                    </select>
                    <button type="submit"
                      className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition whitespace-nowrap">
                      Change role
                    </button>
                  </form>

                  <form action={removeAdmin}>
                    <input type="hidden" name="adminId" value={member.id} />
                    <ConfirmButton
                      message={`Remove ${member.name} from the team?`}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-red-100 text-red-500 font-semibold hover:bg-red-50 transition whitespace-nowrap">
                      Remove
                    </ConfirmButton>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>

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

      {/* ── Add team member ─────────────────────────────────────────── */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c41230" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Add team member
          </span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>

        <form action={inviteAdmin} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Full name</label>
              <input type="text" name="name" required placeholder="Jane Smith"
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-semibold block mb-1">Role</label>
              <select name="role"
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
                <option value="STAFF">Staff — orders only</option>
                <option value="MANAGER">Manager — menu, schedule, reports</option>
                <option value="OWNER">Owner — full access</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">Email address</label>
            <input type="email" name="email" required placeholder="jane@example.com"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-semibold block mb-1">Temporary password</label>
            <input type="password" name="password" required minLength={8}
              placeholder="Min 8 characters — they can change it after logging in"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Add team member
          </button>
        </form>
      </details>
    </div>
  );
}
