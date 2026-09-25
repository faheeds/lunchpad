import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendKitchenPrepEmail } from "@/lib/email/service";
import { formatInTimeZone } from "date-fns-tz";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * GET /api/cron/kitchen-sheets
 * Wired into vercel.json to run hourly (0 * * * *) -- Vercel Cron invokes
 * this with `Authorization: Bearer $CRON_SECRET`, same as the other cron
 * routes (see cutoff-reminder/route.ts), not a query-string secret.
 * Finds every delivery date happening TODAY in the restaurant's local timezone
 * whose restaurant has kitchenSheetSendHour == the current LOCAL hour for that
 * restaurant's timezone, and sends the kitchen prep sheet email.
 */
async function verifyAuth(request: NextRequest): Promise<boolean> {
  if (!env.CRON_SECRET) {
    console.warn("[kitchen-sheets-cron] CRON_SECRET not set, accepting all requests (dev only)");
    return true;
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && token === env.CRON_SECRET;
}

export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) {
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
      kitchenSheetSentAt: null,
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

    // Atomic claim: only proceed if we're the run that flips
    // kitchenSheetSentAt from null -> now. If a late/duplicate/overlapping
    // cron invocation races this one, exactly one of them updates a row
    // (count === 1) and sends; the other sees count === 0 and skips.
    const claim = await prisma.deliveryDate.updateMany({
      where: { id: dd.id, kitchenSheetSentAt: null },
      data: { kitchenSheetSentAt: now },
    });
    if (claim.count === 0) {
      results.push({ deliveryDateId: dd.id, sent: false, skipped: "Already sent (race)" });
      continue;
    }

    try {
      await sendKitchenPrepEmail(dd.id);
      results.push({ deliveryDateId: dd.id, sent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Sending failed after we claimed it -- release the claim so the next
      // hourly run retries instead of silently never sending this date.
      await prisma.deliveryDate.update({
        where: { id: dd.id },
        data: { kitchenSheetSentAt: null },
      });
      results.push({ deliveryDateId: dd.id, sent: false, error: message });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;
  return NextResponse.json({ ok: true, sent: sentCount, checked: deliveryDates.length, results });
}
