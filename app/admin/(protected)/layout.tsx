import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const adminRole = session.user?.adminRole ?? "STAFF";
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav adminRole={adminRole} />
      <d