/**
 * One-time migration: standardise removal toppings for burger/sandwich items.
 *
 * Target items  : gourmet-burgers, crispy-chicken-sandwich, grilled-chicken-sandwich
 * New removals  : Lettuce, Pickles, Tomatoes, Red Onions
 * Excluded items: classic-cheeseburger, nashville-chicken-sandwich (unchanged)
 *
 * Run once against production:
 *   npx tsx prisma/fix-removals.ts
 */

import { PrismaClient, MenuOptionType } from "@prisma/client";

const prisma = new PrismaClient();

const STANDARD_REMOVALS = [
  { name: "Lettuce",    sortOrder: 1 },
  { name: "Pickles",    sortOrder: 2 },
  { name: "Tomatoes",   sortOrder: 3 },
  { name: "Red Onions", sortOrder: 4 },
  { name: "Sauce",      sortOrder: 5 },
];

const TARGET_SLUGS = [
  "gourmet-burgers",
  "crispy-chicken-sandwich",
  "grilled-chicken-sandwich",
];

async function main() {
  for (const slug of TARGET_SLUGS) {
    const item = await prisma.menuItem.findUnique({ where: { slug } });
    if (!item) {
      console.warn(`⚠️  Item not found: ${slug} — skipping`);
      continue;
    }

    // Delete all existing REMOVAL options for this item.
    const deleted = await prisma.menuOption.deleteMany({
      where: { menuItemId: item.id, optionType: MenuOptionType.REMOVAL },
    });
    console.log(`🗑  ${slug}: removed ${deleted.count} old REMOVAL option(s)`);

    // Insert the standard set.
    await prisma.menuOption.createMany({
      data: STANDARD_REMOVALS.map((r) => ({
        menuItemId: item.id,
        name: r.name,
        optionType: MenuOptionType.REMOVAL,
        priceDeltaCents: 0,
        sortOrder: r.sortOrder,
      })),
    });
    console.log(`✅  ${slug}: added standard removals (Lettuce, Pickles, Tomatoes, Red Onions, Sauce)`);
  }

  console.log("\nDone.");
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
