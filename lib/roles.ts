// Pure role helpers — safe to import in both server and client components.
export const ADMIN_ROLES = ["STAFF", "MANAGER", "OWNER"] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export function roleLevel(role: string | undefined): number {
  const idx = ADMIN_ROLES.indexOf((role ?? "") as AdminRole);
  return idx === -1 ? -1 : idx;
}

export function hasRole(userRole: string | undefined, minRole: AdminRole): boolean {
  return roleLevel(userRole) >= roleLevel(minRole);
}
