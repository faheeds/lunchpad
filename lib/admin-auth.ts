import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
export { ADMIN_ROLES, hasRole, roleLevel } from "@/lib/roles";
export type { AdminRole } from "@/lib/roles";

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
export async function requireAdminRole(minRole: import("@/lib/roles").AdminRole): Promise<void> {
  const { hasRole } = await import("@/lib/roles");
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
export async function assertAdminApiRequest(minRole?: import("@/lib/roles").AdminRole): Promise<void> {
  const { hasRole } = await import("@/lib/roles");
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
  if (minRole && !hasRole(session.user.adminRole, minRole)) {
    throw new Error("Insufficient permissions");
  }
}
