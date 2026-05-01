import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

async function inviteAdmin(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name  = String(formData.get("name")  || "").trim();
  const role  = String(formData.get("role")  || "STAFF") as "OWNER" | "MANAGER" | "STAFF";
  const password = String(formData.get("password") || "").trim();

  if (!email || !name || !password) throw new Error("All fields are required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.adminUser.create({
    data: { restaurantId: restaurant.id, email, name, role, passwordHash }
  });

  revalidatePath("/admin/team");
}

async function removeAdmin(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  const session = await auth();
  const adminId = String(formData.get("adminId"));

  // Prevent self-removal
  if (session?.user?.adminUserId === adminId) {
    throw new Error("You cannot remove yourself");
  }

  await prisma.adminUser.delete({ where: { id: adminId, restaurantId: restaurant.id } });
  revalidatePath("/admin/team");
}

async function changeRole(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  const session = await auth();
  const adminId = String(formData.get("adminId"));
  const role = String(formData.get("role")) as "OWNER" | "MANAGER" | "STAFF";

  // Prevent changing own role
  if (session?.user?.adminUserId === adminId) {
    throw new Error("You cannot change your own role");
  }

  await prisma.adminUser.update({ where: { id: adminId, restaurantId: restaurant.id }, data: { role } });
  revalidatePath("/admin/team");
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  OWNER:   { label: "Owner",   color: "#7c3aed" },
  MANAGER: { label: "Manager", color: "#0369a1" },
  STAFF:   { label: "Staff",   color: "#374151" },
};

export default async function AdminTeamPage() {
  const [restaurant, session] = await Promise.all([requireRestaurant(), auth()]);
  await requireAdminRole("OWNER");

  const team = await prisma.adminUser.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: [{ role: "asc" }, { name: "asc" }]
  });

  const currentAdminId = session?.user?.adminUserId;

  return (
    <div className="space-y-4 pb-10 max-w-lg">
      <h1 className="text-[17px] font-semibold text-ink">Team</h1>

      {/* Team list */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">{team.length} member{team.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="divide-y divide-slate-50">
          {team.map((member) => {
            const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.STAFF;
            const isSelf = member.id === currentAdminId;
            return (
              <div key={member.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink truncate">{member.name}</p>
                      {isSelf && <span className="text-[10px] text-slate-400">(you)</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{member.email}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                    style={{ background: badge.color }}>
                    {badge.label}
                  </span>
                </div>

                {!isSelf && (
                  <div className="flex items-center gap-2 mt-2">
                    {/* Change role */}
                    <form action={changeRole} className="flex items-center gap-1 flex-1">
                      <input type="hidden" name="adminId" value={member.id} />
                      <select name="role" defaultValue={member.role}
                        className="flex-1 rounded-lg border border-slate-200 text-[11px] py-1 px-2">
                        <option value="STAFF">Staff</option>
                        <option value="MANAGER">Manager</option>
                        <option value="OWNER">Owner</option>
                      </select>
                      <button type="submit"
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition">
                        Update
                      </button>
                    </form>

                    {/* Remove */}
                    <form action={removeAdmin}>
                      <input type="hidden" name="adminId" value={member.id} />
                      <button type="submit"
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-red-100 text-red-500 font-medium hover:bg-red-50 transition"
                        onClick={(e) => { if (!confirm(`Remove ${member.name}?`)) e.preventDefault(); }}>
                        Remove
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite form */}
      <form action={inviteAdmin} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Add team member</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Name</label>
              <input type="text" name="name" required
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Role</label>
              <select name="role"
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Email</label>
            <input type="email" name="email" required
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Temporary password</label>
            <input type="password" name="password" required minLength={8}
              placeholder="Min 8 characters"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
        </div>
        <div className="px-4 pb-4">
          <button type="submit"
            className="w-full py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Add member
          </button>
        </div>
      </form>
    </div>
  );
}
