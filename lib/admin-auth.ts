import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "ADMIN") {
    redirect("/admin/login");
  }
  return session;
}

export async function assertAdminApiRequest() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
  return session;
}
