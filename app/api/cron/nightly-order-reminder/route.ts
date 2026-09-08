/**
 * GET /api/cron/nightly-order-reminder
 *
 * Reminds EVERY parent who hasn't yet placed a paid order for their
 * child's school's next delivery date -- unlike /api/cron/cutoff-reminder
 * (which only covers parents with an active WeeklyLunchPlan saved in
 * advance), this covers everyone regardless of whether they use weekly
 * planning or the ad-hoc same-day cart. Confirmed as a real gap: a
 * parent who always checks out immediately via the ad-hoc cart would
 * never trigger the weekly-plan-only reminder, since there's never an
 * "unpaid weekly plan" for it to find.
 *
 * Runs once daily (see vercel.json) at a fixed UTC time chosen to land
 * at 8pm Pacific -- confirmed intentional simplification: Vercel's
 * Hobby plan hard-caps cron jobs at once per day (an hourly per-school-
 * timezone schedule would fail at deploy time), so this is correct for
 * schools in Pacific time and off by however many hours for schools
 * elsewhere. Also note Pacific's DST means this specific UTC offset
 * needs a manual one-hour adjustment (and redeploy) twice a year to
 * stay accurate -- a known limitation of Vercel Cron on any plan, not
 * something fixable in this code. Revisit if upgrading to Pro (per-
 * school-timezone hourly checks) or moving crons to an external
 * scheduler with real timezone support.
 *
 * "Next delivery date" means tomorrow's date in EACH SCHOOL'S OWN local
 * calendar (even though the run's timing itself isn't precisely
 * per-timezone) -- a school on the other side of an international date
 * line from Pacific time still gets asked about the correct calendar
 * date for their own delivery, not Pacific's.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendPushToParent } from "@/lib/push/service";
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";

export const runtime = "nodejs";

async function verifyAuth(request: NextRequest): Promise<boolean> {
  if (!env.CRON_SECRET) {
    console.warn("[nightly-order-reminder-cron] CRON_SECRET not set, accepting all requests (dev only)");
    return true;
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token === env.CRON_SECRET;
}

interface ReminderResult {
  restaurantSlug: string;
  schoolId: string;
  schoolName: string;
  deliveryDateId: string;
  parentUserId: string;
  sent: boolean;
  error?: string;
}

export async function GET(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  if (!(await verifyAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: ReminderResult[] = [];
  const errors: string[] = [];
  const now = new Date();

  try {
    const activeSchools = await prisma.school.findMany({
      where: { isActive: true },
      include: { restaurant: true },
    });

    for (const school of activeSchools) {
      const restaurant = school.restaurant;

      try {
        // "Tomorrow" in the school's own local calendar -- computed per
        // school even though the run's own timing is a single fixed UTC
        // time (see the file-level comment on why: Hobby plan limits).
        const tomorrowLocalStr = formatInTimeZone(addDays(now, 1), school.timezone, "yyyy-MM-dd");

        const candidateDates = await prisma.deliveryDate.findMany({
          where: {
            schoolId: school.id,
            cancelledAt: null,
            orderingOpen: true,
          },
          select: { id: true, deliveryDate: true },
        });
        const targetDate = candidateDates.find(
          (d) => formatInTimeZone(d.deliveryDate, school.timezone, "yyyy-MM-dd") === tomorrowLocalStr
        );

        if (!targetDate) continue; // no delivery scheduled tomorrow at this school -- nothing to remind about

        // Every parent with at least one active child at this school.
        const parents = await prisma.parentUser.findMany({
          where: {
            restaurantId: restaurant.id,
            children: { some: { schoolId: school.id, archivedAt: null } },
          },
          select: { id: true },
        });

        for (const parent of parents) {
          try {
            const existingOrder = await prisma.order.findFirst({
              where: {
                parentUserId: parent.id,
                deliveryDateId: targetDate.id,
                restaurantId: restaurant.id,
                status: "PAID",
                archivedAt: null,
              },
              select: { id: true },
            });

            if (existingOrder) continue; // already ordered -- no need to remind

            if (!dryRun) {
              await sendPushToParent(parent.id, {
                title: "Order lunch for tomorrow",
                body: "Don't forget to place your order before tomorrow's cutoff.",
                data: { screen: "order" },
              });
            }

            results.push({
              restaurantSlug: restaurant.slug,
              schoolId: school.id,
              schoolName: school.name,
              deliveryDateId: targetDate.id,
              parentUserId: parent.id,
              sent: !dryRun,
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error sending reminder";
            errors.push(`[${restaurant.slug}/${school.id}/${parent.id}] ${errMsg}`);
            results.push({
              restaurantSlug: restaurant.slug,
              schoolId: school.id,
              schoolName: school.name,
              deliveryDateId: targetDate.id,
              parentUserId: parent.id,
              sent: false,
              error: errMsg,
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error processing school";
        errors.push(`[${restaurant.slug}/${school.id}] ${errMsg}`);
      }
    }

    if (errors.length > 0) {
      console.error("[nightly-order-reminder-cron] Errors:", errors);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      schoolsChecked: activeSchools.length,
      processed: results.length,
      results,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[nightly-order-reminder-cron] Fatal error:", err);
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}
