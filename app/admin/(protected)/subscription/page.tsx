import { requireAdmin } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { prisma } from "@/lib/db";
import { planSummary } from "@/lib/plans";
import { SubscriptionPageContent } from "./subscription-page-content";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  await requireAdmin();
  const restaurant = await requireRestaurant();
  const full = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
  if (!full) return null;

  const params = await searchParams;
  const justActivated = params.success === "1";

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [locationCount, teamSeatCount, ordersThisMonth] = await Promise.all([
    prisma.school.count({ where: { restaurantId: full.id, isActive: true } }),
    prisma.adminUser.count({ where: { restaurantId: full.id } }),
    prisma.order.count({
      where: { restaurantId: full.id, status: "PAID", createdAt: { gte: monthStart } },
    }),
  ]);
  const usage = planSummary(full.plan, {
    locations: locationCount,
    teamSeats: teamSeatCount,
    ordersThisMonth,
  });

  return <SubscriptionPageContent full={full} justActivated={justActivated} usage={usage} />;
}
