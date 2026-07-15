import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendWeeklyPlanCutoffReminderEmail } from "@/lib/email/service";
import { formatInTimeZone } from "date-fns-tz";
import { addHours } from "date-fns";

export const runtime = "nodejs";

async function verifyAuth(request: NextRequest): Promise<boolean> {
  if (!env.CRON_SECRET) {
    console.warn("[cutoff-reminder-cron] CRON_SECRET not set, accepting all requests (dev only)");
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token === env.CRON_SECRET;
}

interface ReminderResult {
  restaurant: {
    id: string;
    slug: string;
    name: string;
  };
  school: {
    id: string;
    name: string;
  };
  deliveryDate: string;
  parentEmail: string;
  childName: string;
  sent: boolean;
  error?: string;
}

export async function GET(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: ReminderResult[] = [];
  const errors: string[] = [];
  const now = new Date();

  try {
    // Find all delivery dates where cutoff falls within the next 24 hours (day-before reminder window).
    // Running daily at a fixed UTC time, this window is contiguous and non-overlapping across runs,
    // so each cutoff timestamp is caught by exactly one run.
    const minCutoff = now;
    const maxCutoff = addHours(now, 24);

    const upcomingDeliveryDates = await prisma.deliveryDate.findMany({
      where: {
        cutoffAt: {
          gte: minCutoff,
          lte: maxCutoff,
        },
        cancelledAt: null,
      },
      include: {
        school: {
          include: { restaurant: true },
        },
      },
    });

    for (const deliveryDate of upcomingDeliveryDates) {
      const school = deliveryDate.school;
      const restaurant = school.restaurant;

      try {
        // Get the weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday) in the school's local timezone
        const deliveryDateStr = formatInTimeZone(deliveryDate.deliveryDate, school.timezone, "yyyy-MM-dd");
        const deliveryWeekday = new Date(`${deliveryDateStr}T00:00:00`).getDay();

        // Find all ACTIVE weekly lunch plans for this weekday/school
        const weeklyPlans = await prisma.weeklyLunchPlan.findMany({
          where: {
            schoolId: school.id,
            weekday: deliveryWeekday,
            isActive: true,
          },
          include: {
            parentUser: true,
            parentChild: true,
            menuItem: true,
          },
        });

        // Track which (parentEmail, deliveryDateId) pairs we've already emailed
        // in this run to avoid duplicates
        const sentKey = (email: string, dateId: string) => `${email}:${dateId}`;
        const alreadySent = new Set<string>();

        for (const plan of weeklyPlans) {
          try {
            const parentEmail = plan.parentUser.email;
            const childName = plan.parentChild.studentName;
            const key = sentKey(parentEmail, deliveryDate.id);

            if (alreadySent.has(key)) {
              continue;
            }

            // Check if this parent already has a PAID order for this delivery date
            const existingOrder = await prisma.order.findFirst({
              where: {
                parentUserId: plan.parentUserId,
                deliveryDateId: deliveryDate.id,
                restaurantId: restaurant.id,
                status: "PAID",
                archivedAt: null,
              },
              select: { id: true },
            });

            if (existingOrder) {
              // Already has a paid order, skip
              continue;
            }

            // Build item list from weekly plans for this child
            const planItems = await prisma.weeklyLunchPlan.findMany({
              where: {
                parentUserId: plan.parentUserId,
                parentChildId: plan.parentChildId,
                schoolId: school.id,
                weekday: deliveryWeekday,
                isActive: true,
              },
              include: {
                menuItem: true,
              },
            });

            const items = planItems.map((p) => {
              const item: { itemName: string; choice?: string } = {
                itemName: p.menuItem.name,
              };
              if (p.choice) item.choice = p.choice;
              return item;
            });

            const orderUrl = `https://${restaurant.slug}.${env.ROOT_DOMAIN}`;

            if (!dryRun) {
              await sendWeeklyPlanCutoffReminderEmail({
                parentEmail,
                parentName: plan.parentUser.name || "there",
                childName,
                deliveryDate: deliveryDate.deliveryDate,
                cutoffAt: deliveryDate.cutoffAt,
                timezone: school.timezone,
                schoolName: school.name,
                items,
                orderUrl,
                restaurantName: restaurant.name,
              });
            }

            alreadySent.add(key);

            results.push({
              restaurant: {
                id: restaurant.id,
                slug: restaurant.slug,
                name: restaurant.name,
              },
              school: {
                id: school.id,
                name: school.name,
              },
              deliveryDate: deliveryDate.deliveryDate.toISOString(),
              parentEmail,
              childName,
              sent: !dryRun,
            });
          } catch (err) {
            const errMsg =
              err instanceof Error ? err.message : "Unknown error sending cutoff reminder";
            errors.push(
              `[${restaurant.slug}/${school.id}/${deliveryDate.id}/${plan.parentUserId}] ${errMsg}`
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
              },
              deliveryDate: deliveryDate.deliveryDate.toISOString(),
              parentEmail: plan.parentUser.email,
              childName: plan.parentChild.studentName,
              sent: false,
              error: errMsg,
            });
          }
        }
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Unknown error querying weekly plans";
        errors.push(
          `[${restaurant.slug}/${school.id}/${deliveryDate.id}] ${errMsg}`
        );
      }
    }

    if (errors.length > 0) {
      console.error("[cutoff-reminder-cron] Errors:", errors);
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
    console.error("[cutoff-reminder-cron] Fatal error:", err);
    return NextResponse.json(
      { error: message, ok: false },
      { status: 500 }
    );
  }
}
