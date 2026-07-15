import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendKitchenPrepEmail } from "@/lib/email/service";
import { formatInTimeZone } from "date-fns-tz";

export const runtime = "nodejs";

async function verifyAuth(request: NextRequest): Promise<boolean> {
  if (!env.CRON_SECRET) {
    console.warn("[kitchen-sheet-cron] CRON_SECRET not set, accepting all requests (dev only)");
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token === env.CRON_SECRET;
}

interface CronResult {
  restaurant: {
    id: string;
    slug: string;
    name: string;
  };
  school: {
    id: string;
    name: string;
    timezone: string;
  };
  deliveryDate: string;
  delivered: boolean;
  error?: string;
}

export async function GET(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: CronResult[] = [];
  const errors: string[] = [];

  try {
    // Find all active restaurants with delivery dates matching today in their local timezone
    const restaurants = await prisma.restaurant.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true },
    });

    for (const restaurant of restaurants) {
      try {
        // Get schools for this restaurant
        const schools = await prisma.school.findMany({
          where: { restaurantId: restaurant.id, isActive: true },
          select: { id: true, name: true, timezone: true },
        });

        for (const school of schools) {
          try {
            const now = new Date();
            const schoolDate = formatInTimeZone(now, school.timezone, "yyyy-MM-dd");

            // Find delivery dates for today with at least 1 PAID order
            const deliveryDates = await prisma.deliveryDate.findMany({
              where: {
                schoolId: school.id,
                deliveryDate: {
                  gte: new Date(`${schoolDate}T00:00:00Z`),
                  lt: new Date(`${schoolDate}T23:59:59Z`),
                },
              },
              include: {
                _count: {
                  select: {
                    orders: {
                      where: { status: "PAID", archivedAt: null },
                    },
                  },
                },
              },
            });

            for (const deliveryDate of deliveryDates) {
              if (deliveryDate._count.orders === 0) continue;

              try {
                if (!dryRun) {
                  await sendKitchenPrepEmail(deliveryDate.id);
                }

                results.push({
                  restaurant: {
                    id: restaurant.id,
                    slug: restaurant.slug,
                    name: restaurant.name,
                  },
                  school: {
                    id: school.id,
                    name: school.name,
                    timezone: school.timezone,
                  },
                  deliveryDate: deliveryDate.deliveryDate.toISOString(),
                  delivered: !dryRun,
                });
              } catch (err) {
                const errMsg =
                  err instanceof Error
                    ? err.message
                    : "Unknown error sending kitchen email";
                errors.push(
                  `[${restaurant.slug}/${school.id}/${deliveryDate.id}] ${errMsg}`
                );
                results.push({
                  restaurant: {
                    id: restaurant.id,
                    slug: restaurant.slug,
                    name: restaurant.name,
                  },
                  school: {
                    id: school.id,
                    name: school.name,
                    timezone: school.timezone,
                  },
                  deliveryDate: deliveryDate.deliveryDate.toISOString(),
                  delivered: false,
                  error: errMsg,
                });
              }
            }
          } catch (err) {
            const errMsg =
              err instanceof Error ? err.message : "Unknown error querying delivery dates";
            errors.push(`[${restaurant.slug}/${school.id}] ${errMsg}`);
          }
        }
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Unknown error querying schools";
        errors.push(`[${restaurant.slug}] ${errMsg}`);
      }
    }

    if (errors.length > 0) {
      console.error("[kitchen-sheet-cron] Errors:", errors);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      processed: results.length,
      results,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[kitchen-sheet-cron] Fatal error:", err);
    return NextResponse.json(
      { error: message, ok: false },
      { status: 500 }
    );
  }
}
