import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendKitchenPrepEmail } from "@/lib/email/service";
import { formatInTimeZone } from "date-fns-tz";

/**
 * GET /api/cron/kitchen-sheets
 * Called by an external scheduler (e.g. cron-job.org) once per hour.
 * Finds every delivery date happening TODAY in the restaurant's local timezone
 * whose restaurant has kitchenSheetSendHour == the current LOCAL hour for that
 * restaurant's timezone, and sends the kitchen prep sheet email.
 *
 * Protect with ?secret=CRON_SECRET query param.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all delivery dates in the upcoming 2-day window (covers all timezones)
  // for restaurants that have auto-send enabled with a contact email.
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const deliveryDates = await prisma.deliveryDate.findMany({
    where: {
      deliveryDate: { gte: windowStart, lt: windowEnd },
      school: {
        restaurant: {
          kitchenSheetSendHour: { not: null },
          contactEmail: { not: null },
        },
      },
    },
    include: {
      school: { include: { restaurant: true } },
      _count: { select: { orders: { where: { status: "PAID", archivedAt: null } } } },
    },
  });

  const results: { deliveryDateId: string; sent: boolean; skipped?: string; error?: string }[] = [];

  for (const dd of deliveryDates) {
    const tz = dd.school.timezone;
    const restaurant = dd.school.restaurant;

    // Check the delivery date is TODAY in the restaurant's local timezone
    const localDeliveryDate = formatInTimeZone(dd.deliveryDate, tz, "yyyy-MM-dd");
    const localToday = formatInTimeZone(now, tz, "yyyy-MM-dd");
    if (localDeliveryDate !== localToday) {
      continue; // Not today in this timezone
    }

    // Check current LOCAL hour matches configured send hour
    const localCurrentHour = parseInt(formatInTimeZone(now, tz, "H"), 10);
    if (localCurrentHour !== restaurant.kitchenSheetSendHour) {
      continue; // Not the right hour yet
    }

    if (dd._count.orders === 0) {
      results.push({ deliveryDateId: dd.id, sent: false, skipped: "No paid orders" });
      continue;
    }

    try {
      await sendKitchenPrepEmail(dd.id);
      results.push({ deliveryDateId: dd.id, sent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ deliveryDateId: dd.id, sent: false, error: message });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;
  return NextResponse.json({ ok: true, sent: sentCount, checked: deliveryDates.length, results });
}
