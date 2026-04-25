import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { PrismaClient, MenuOptionType } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_TIMEZONE = "America/Los_Angeles";

function zonedCalendarDay(daysOut: number) {
  return formatInTimeZone(addDays(new Date(), daysOut), SEED_TIMEZONE, "yyyy-MM-dd");
}

function dayOfWeekInZone(daysOut: number) {
  return Number(formatInTimeZone(addDays(new Date(), daysOut), SEED_TIMEZONE, "i"));
}

function zonedDateAt(daysOut: number, hour = 9, minute = 0) {
  const isoDay = zonedCalendarDay(daysOut);
  return fromZonedTime(
    `${isoDay} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
    SEED_TIMEZONE
  );
}

function nextBusinessDayOffsets(count: number) {
  const offsets: number[] = [];
  let daysOut = 1;
  while (offsets.length < count) {
    const weekday = dayOfWeekInZone(daysOut);
    if (weekday >= 1 && weekday <= 5) offsets.push(daysOut);
    daysOut += 1;
  }
  return offsets;
}

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@demo.lunchpad.us").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // ── 1. Create demo restaurant ─────────────────────────────────────────────
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "demo" },
    update: { name: "Demo Kitchen", isActive: true },
    create: {
      name: "Demo Kitchen",
      slug: "demo",
      timezone: SEED_TIMEZONE,
      contactEmail: adminEmail,
      isActive: true,
    },
  });

  console.log(`Restaurant: ${restaurant.name} (${restaurant.slug})`);

  // ── 2. Create admin user ──────────────────────────────────────────────────
  await prisma.adminUser.upsert({
    where: { restaurantId_email: { restaurantId: restaurant.id, email: adminEmail } },
    update: { passwordHash, name: "Admin" },
    create: {
      restaurantId: restaurant.id,
      email: adminEmail,
      name: "Admin",
      passwordHash,
      role: "OWNER",
    },
  });

  console.log(`Admin: ${adminEmail}`);

  // ── 3. Create schools ─────────────────────────────────────────────────────
  const [school1, school2] = await Promise.all([
    prisma.school.upsert({
      where: { restaurantId_slug: { restaurantId: restaurant.id, slug: "demo-school-north" } },
      update: { name: "Demo School North", isActive: true },
      create: {
        restaurantId: restaurant.id,
        name: "Demo School North",
        slug: "demo-school-north",
        timezone: SEED_TIMEZONE,
        defaultCutoffHour: 21,
        defaultCutoffMinute: 0,
        collectTeacher: false,
        collectClassroom: false,
      },
    }),
    prisma.school.upsert({
      where: { restaurantId_slug: { restaurantId: restaurant.id, slug: "demo-school-south" } },
      update: { name: "Demo School South", isActive: true },
      create: {
        restaurantId: restaurant.id,
        name: "Demo School South",
        slug: "demo-school-south",
        timezone: SEED_TIMEZONE,
        defaultCutoffHour: 21,
        defaultCutoffMinute: 0,
        collectTeacher: false,
        collectClassroom: false,
      },
    }),
  ]);

  console.log(`Schools: ${school1.name}, ${school2.name}`);

  // ── 4. Create menu items ──────────────────────────────────────────────────
  const menuItemsData = [
    { slug: "classic-burger", name: "Classic Burger", description: "Beef patty with lettuce, tomato, pickles, ketchup and mustard", basePriceCents: 799 },
    { slug: "cheeseburger", name: "Cheeseburger", description: "Classic burger with American cheese", basePriceCents: 849 },
    { slug: "chicken-sandwich", name: "Crispy Chicken Sandwich", description: "Crispy fried chicken breast on a brioche bun", basePriceCents: 899 },
    { slug: "grilled-chicken", name: "Grilled Chicken Sandwich", description: "Grilled chicken breast with lettuce and tomato", basePriceCents: 899 },
    { slug: "mac-n-cheese", name: "Mac & Cheese", description: "Creamy house-made mac and cheese", basePriceCents: 699 },
    { slug: "chicken-tenders", name: "Chicken Tenders (3pc)", description: "Crispy chicken tenders with dipping sauce", basePriceCents: 799 },
    { slug: "fries", name: "French Fries", description: "Golden crispy fries", basePriceCents: 299 },
    { slug: "tots", name: "Tater Tots", description: "Crispy tater tots", basePriceCents: 299 },
    { slug: "brownie", name: "Chocolate Brownie", description: "Rich chocolate brownie", basePriceCents: 199 },
    { slug: "cookie", name: "Chocolate Chip Cookie", description: "Large fresh-baked cookie", basePriceCents: 149 },
  ];

  const menuItems = await Promise.all(
    menuItemsData.map((item) =>
      prisma.menuItem.upsert({
        where: { restaurantId_slug: { restaurantId: restaurant.id, slug: item.slug } },
        update: { name: item.name, description: item.description, basePriceCents: item.basePriceCents, isActive: true },
        create: { restaurantId: restaurant.id, ...item },
      })
    )
  );

  console.log(`Menu items: ${menuItems.length} created/updated`);

  // Add options to the Classic Burger
  const burger = menuItems[0];
  const existingOptions = await prisma.menuOption.count({ where: { menuItemId: burger.id } });
  if (existingOptions === 0) {
    await prisma.menuOption.createMany({
      data: [
        { menuItemId: burger.id, name: "No Pickles", optionType: MenuOptionType.REMOVAL, sortOrder: 0 },
        { menuItemId: burger.id, name: "No Onions", optionType: MenuOptionType.REMOVAL, sortOrder: 1 },
        { menuItemId: burger.id, name: "Extra Patty", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 300, sortOrder: 2 },
        { menuItemId: burger.id, name: "Add Cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 50, sortOrder: 3 },
      ],
    });
  }

  // ── 5. Create delivery dates for both schools ─────────────────────────────
  const offsets = nextBusinessDayOffsets(5);
  for (const school of [school1, school2]) {
    for (const offset of offsets) {
      const deliveryAt = zonedDateAt(offset, 12, 0);
      const cutoffAt = zonedDateAt(offset - 1, 21, 0);

      const existing = await prisma.deliveryDate.findUnique({
        where: { schoolId_deliveryDate: { schoolId: school.id, deliveryDate: deliveryAt } },
      });

      if (!existing) {
        const dd = await prisma.deliveryDate.create({
          data: { schoolId: school.id, deliveryDate: deliveryAt, cutoffAt, orderingOpen: true },
        });

        // Make all menu items available for this delivery date
        await prisma.deliveryMenuItem.createMany({
          data: menuItems.map((item) => ({
            deliveryDateId: dd.id,
            menuItemId: item.id,
            schoolId: school.id,
            isAvailable: true,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  console.log(`Delivery dates seeded for ${offsets.length} upcoming business days`);
  console.log("\n✓ Seed complete");
  console.log(`  Restaurant slug: demo  →  demo.lunchpad.us`);
  console.log(`  Admin login:     ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
