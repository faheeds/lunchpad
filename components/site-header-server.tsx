import { getCurrentRestaurant } from "@/lib/restaurant";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/site-header";

/**
 * Server component wrapper — fetches restaurant, session, and parent user data,
 * then threads them down to the client header. Use this instead of
 * <SiteHeader /> directly.
 */
export async function SiteHeaderServer() {
  const [restaurant, session] = await Promise.all([
    getCurrentRestaurant(),
    auth(),
  ]);

  let parentName: string | null = null;
  let parentEmail: string | null = null;

  if (session?.user?.parentUserId) {
    const parent = await prisma.parentUser.findUnique({
      where: { id: session.user.parentUserId },
      select: { name: true, email: true },
    });
    parentName = parent?.name ?? null;
    parentEmail = parent?.email ?? null;
  }

  return (
    <SiteHeader
      restaurantName={restaurant?.name ?? "LunchPad"}
      logoUrl={restaurant?.logoUrl ?? null}
      isSignedIn={!!session?.user?.parentUserId}
      userName={parentName}
      userEmail={parentEmail}
    />
  );
}
