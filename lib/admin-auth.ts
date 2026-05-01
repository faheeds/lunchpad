import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Role hierarchy — higher index = more permissions
export const ADMIN_ROLES = ["STAFF", "MANAGER", "OWNER"] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

function roleLevel(role: string | undefined): number {
  const idx = ADMIN_ROLES.indexOf((role ?? "") as AdminRole);
  return idx === -1 ? -1 : idx;
}

export function hasRole(userRole: string | undefined, minRole: AdminR