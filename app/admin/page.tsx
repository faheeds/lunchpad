import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * /admin → smart redirect.
 * - Logged in admin → /admin/dashboard
 * - Not logged in → /admin/login
 *
 * Avoids the bare /admin URL hitting a 404.
 */
export default async function AdminIndexPage() {
  const session = await auth();
  if (session?.user?.role === "ADMIN") {
    redirect("/admin/dashboard");
  }
  redirect("/admin/login");
}
