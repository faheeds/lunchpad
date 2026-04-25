import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function requireParent() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "PARENT" || !session.user.parentUserId) {
    redirect("/account/sign-in");
  }
  return session;
}

export async function assertParentApiRequest() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "PARENT" || !session.user.parentUserId) {
    throw new Error("Unauthorized");
  }
  return session;
}
