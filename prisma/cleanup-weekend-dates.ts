/**
 * One-shot cleanup: delete any DeliveryDate rows whose Pacific calendar day is
 * Saturday or Sunday. The seed prior to this patch had a timezone bug that
 * sometimes created weekend dates (and skipped the adjacent Monday). After
 * deploying the seed fix, run this once against the same DB to remove the
 * bad rows.
 *
 * Usage (from repo root, with DATABASE_URL set to the NEON DIRECT url):
 *   npx tsx prisma/cleanup-weekend-dates.ts
 *
 * Safety: skips any weekend DeliveryDate that has an Order or
 * WeeklyCheckoutBatchItem attached (those would fail the Restrict FK anyway).
 * After the deletion, re-run the seed (`npx prisma db seed`) to backfill the
 * missing weekday dates.
 */
import { PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.deliveryDate.findMany({
    include: {
      school: true,
      _count: { select: { orders: true, weeklyCheckoutItems: true } }
    },
    orderBy: { deliveryDate: "asc" }
  });

  const weekends = all.filter((d) => {
    const dow = Number(formatInTimeZone(d.deliveryDate, d.school.timezone, "i"));
    return dow === 6 || dow === 7; // Saturday=6, Sunday=7 in the "i" token
  });

  if (!weekends.length) {
    console.log("No weekend DeliveryDate rows found. Nothing to do.");
    return;
  }

  console.log(`Found ${weekends.length} weekend delivery date(s):`);
  for (const d of weekends) {
    const label = formatInTimeZone(d.deliveryDate, d.school.timezone, "EEE MMM d yyyy");
    const blocked = d._count.orders > 0 || d._count.weeklyCheckoutItems > 0;
    console.log(
      `  [${d.id}] ${d.school.name} ${label}` +
        (blocked
          ? ` — SKIP (${d._count.orders} orders, ${d._count.weeklyCheckoutItems} weekly items)`
          : "")
    );
  }

  const deletable = weekends.filter(
    (d) => d._count.orders === 0 && d._count.weeklyCheckoutItems === 0
  );

  for (const d of deletable) {
    await prisma.deliveryDate.delete({ where: { id: d.id } });
  }

  console.log(`Deleted ${deletable.length}. Skipped ${weekends.length - deletable.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
