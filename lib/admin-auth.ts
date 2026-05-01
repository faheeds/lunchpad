import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Role hierarchy — higher index = more permissions
export const ADMIN_ROLES = ["STAFF", "MANAGER", "OWNER"] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

function roleLevel(role: string | undefined): number {
  const idx = ADMIN_ROLES.indexOf((role ?? "") as AdminRole);
  return idx === -1 ? -1 : idx;
}

export function hasRole(userRole: string | undefined, minRole: AdminRole): boolean {
  return roleLevel(userRole) >= roleLevel(minRole);
}

/**
 * Require the user to be logged in as any admin role.
 * Redirects to /admin/login if not authenticated.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/login");
  }
  return session;
}

/**
 * Require a minimum admin role. Redirects to /admin/dashboard if insufficient.
 */
export async function requireAdminRole(minRole: AdminRole): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/login");
  }
  if (!hasRole(session.user.adminRole, minRole)) {
    redirect("/admin/dashboard");
  }
}

/**
 * For use in API routes — throws instead of redirecting.
 */
export async function assertAdminApiRequest(minRole?: AdminRole): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
  if (minRole && !hasRole(session.user.adminRole, minRole)) {
    throw new Error("Insufficient permissions");
  }
}
