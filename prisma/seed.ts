import bcrypt from "bcryptjs";
import { addDays, set } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { PrismaClient, MenuOptionType } from "@prisma/client";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";

const prisma = new PrismaClient();

const SEED_TIMEZONE = "America/Los_Angeles";

// Build a Pacific-calendar date N days from today. All offset math and weekday
// checks must happen in the same frame (Pacific), or you get the old bug where
// a seed run in the evening PT would mis-classify Saturdays as Fridays and
// create weekend delivery dates.
function zonedCalendarDay(daysOut: number) {
  const base = addDays(new Date(), daysOut);
  // The Pacific-local yyyy-MM-dd for that instant.
  return formatInTimeZone(base, SEED_TIMEZONE, "yyyy-MM-dd");
}

function dayOfWeekInZone(daysOut: number) {
  // date-fns-tz "i" token: 1 = Mon ... 7 = Sun.
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
    // 1-5 = Mon-Fri in the "i" token.
    if (weekday >= 1 && weekday <= 5) {
      offsets.push(daysOut);
    }
    daysOut += 1;
  }

  return offsets;
}

async function main() {
  const defaultSeedAdminEmail = "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ALIF@lbb786";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "aliffoods@outlook.com").toLowerCase();
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const activeSchoolSlugs = [...ALLOWED_SCHOOL_SLUGS];
  const activeMenuSlugs = [
    "build-your-own-burger",
    "gourmet-burgers",
    "classic-cheeseburger",
    "crispy-chicken-sandwich",
    "grilled-chicken-sandwich",
    "nashville-chicken-sandwich",
    "chicken-salad-bowl",
    "beef-salad-bowl",
    "mac-n-cheese",
    "chicken-quesadilla",
    "beef-quesadilla",
    "chicken-wings-4pc",
    "chicken-tenders",
    "chicken-tenders-fries",
    "fries",
    "tots",
    "onion-rings",
    "mozzarella-sticks",
    "large-brownie",
    "large-choc-chip-cookie",
    "churro-cake"
  ];

  const existingSeedAdmin = await prisma.adminUser.findUnique({
    where: { email: defaultSeedAdminEmail }
  });

  const existingTargetAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail }
  });

  if (existingSeedAdmin && adminEmail !== defaultSeedAdminEmail && !existingTargetAdmin) {
    await prisma.adminUser.update({
      where: { id: existingSeedAdmin.id },
      data: {
        email: adminEmail,
        passwordHash,
        name: "Restaurant Admin"
      }
    });
  } else {
    await prisma.adminUser.upsert({
      where: { email: adminEmail },
      update: { passwordHash, name: "Restaurant Admin" },
      create: {
        email: adminEmail,
        name: "Restaurant Admin",
        passwordHash
      }
    });

    if (adminEmail !== defaultSeedAdminEmail) {
      await prisma.adminUser.deleteMany({
        where: { email: defaultSeedAdminEmail }
      });
    }
  }

  await prisma.school.updateMany({
    where: {
      slug: {
        notIn: activeSchoolSlugs
      }
    },
    data: {
      isActive: false
    }
  });

  await prisma.menuItem.updateMany({
    where: {
      slug: {
        notIn: activeMenuSlugs
      }
    },
    data: {
      isActive: false
    }
  });

  const schools = await Promise.all([
    prisma.school.upsert({
      where: { slug: "medina-academy-redmond" },
      update: {
        name: "Medina Academy Redmond",
        timezone: "America/Los_Angeles",
        defaultCutoffHour: 21,
        defaultCutoffMinute: 0,
        collectTeacher: false,
        collectClassroom: false,
        isActive: true
      },
      create: {
        name: "Medina Academy Redmond",
        slug: "medina-academy-redmond",
        timezone: "America/Los_Angeles",
        defaultCutoffHour: 21,
        defaultCutoffMinute: 0,
        collectTeacher: false,
        collectClassroom: false
      }
    }),
    prisma.school.upsert({
      where: { slug: "medina-academy-bellevue" },
      update: {
        name: "Medina Academy Bellevue",
        timezone: "America/Los_Angeles",
        defaultCutoffHour: 21,
        defaultCutoffMinute: 0,
        collectTeacher: false,
        collectClassroom: false,
        isActive: true
      },
      create: {
        name: "Medina Academy Bellevue",
        slug: "medina-academy-bellevue",
        timezone: "America/Los_Angeles",
        defaultCutoffHour: 21,
        defaultCutoffMinute: 0,
        collectTeacher: false,
        collectClassroom: false
      }
    })
  ]);

  const menuDefinitions = [
    {
      name: "Build-Your-Own Burger",
      slug: "build-your-own-burger",
      description: "Signature Burgers & Sandwiches. Choice of beef, crispy or grilled chicken with toppings and sauces. Gluten-free option available.",
      basePriceCents: 999,
      options: [
        { name: "Cheddar", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 1 },
        { name: "Bacon", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 200, sortOrder: 2 },
        { name: "Avocado", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 150, sortOrder: 3 },
        { name: "Gluten Free Bun", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 149, sortOrder: 4 },
        { name: "Extra patty", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 399, sortOrder: 5 },
        { name: "Fried egg", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 199, sortOrder: 6 },
        { name: "Jalapenos", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 49, sortOrder: 7 },
        { name: "Lettuce",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Pickles",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 2 },
        { name: "Tomatoes",   optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 3 },
        { name: "Red Onions", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 4 },
        { name: "Sauce",      optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 5 }
      ]
    },
    {
      name: "Gourmet Burgers",
      slug: "gourmet-burgers",
      description: "Signature Burgers & Sandwiches. Required choice: Bacon Cheddar, Jalapeno Sriracha, Hawaiian (Pineapple) Burger, Western (no veggies), or Shroom n Onions.",
      basePriceCents: 1399,
      options: [
        { name: "Bacon Cheddar", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -5 },
        { name: "Jalapeno Sriracha", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -4 },
        { name: "Hawaiian (Pineapple) Burger", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -3 },
        { name: "Western (no veggies)", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -2 },
        { name: "Shroom n Onions", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -1 },
        { name: "Extra cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 1 },
        { name: "Extra bacon", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 200, sortOrder: 2 },
        { name: "Gluten Free Bun", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 149, sortOrder: 3 },
        { name: "Extra patty", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 399, sortOrder: 4 },
        { name: "Lettuce",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Pickles",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 2 },
        { name: "Tomatoes",   optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 3 },
        { name: "Red Onions", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 4 },
        { name: "Sauce",      optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 5 }
      ]
    },
    {
      name: "Classic Cheeseburger",
      slug: "classic-cheeseburger",
      description: "Signature Burgers & Sandwiches. Angus beef patty with cheddar. Add toppings if you'd like.",
      basePriceCents: 1099,
      options: [
        { name: "Extra cheddar", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 1 },
        { name: "Bacon", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 200, sortOrder: 2 },
        { name: "Gluten Free Bun", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 149, sortOrder: 3 },
        { name: "Extra patty", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 399, sortOrder: 4 },
        { name: "Lettuce", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 49, sortOrder: 10 },
        { name: "Tomato", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 49, sortOrder: 11 },
        { name: "Pickles", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 49, sortOrder: 12 },
        { name: "Onions", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 49, sortOrder: 13 },
        { name: "Jalapenos", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 49, sortOrder: 14 }
      ]
    },
    {
      name: "Crispy Chicken Sandwich",
      slug: "crispy-chicken-sandwich",
      description: "Signature Burgers & Sandwiches. Crispy chicken with lettuce, pickles, and garlic aioli.",
      basePriceCents: 1299,
      options: [
        { name: "Cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 1 },
        { name: "Avocado", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 150, sortOrder: 2 },
        { name: "Gluten Free Bun", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 149, sortOrder: 3 },
        { name: "Lettuce",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Pickles",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 2 },
        { name: "Tomatoes",   optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 3 },
        { name: "Red Onions", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 4 },
        { name: "Sauce",      optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 5 }
      ]
    },
    {
      name: "Grilled Chicken Sandwich",
      slug: "grilled-chicken-sandwich",
      description: "Signature Burgers & Sandwiches. Grilled chicken with fresh toppings.",
      basePriceCents: 1199,
      options: [
        { name: "Cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 1 },
        { name: "Avocado", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 150, sortOrder: 2 },
        { name: "Gluten Free Bun", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 149, sortOrder: 3 },
        { name: "Lettuce",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Pickles",    optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 2 },
        { name: "Tomatoes",   optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 3 },
        { name: "Red Onions", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 4 },
        { name: "Sauce",      optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 5 }
      ]
    },
    {
      name: "Nashville Chicken Sandwich",
      slug: "nashville-chicken-sandwich",
      description: "Signature Burgers & Sandwiches. Crispy Nashville chicken with coleslaw, pickles, and spicy sauce.",
      basePriceCents: 1399,
      options: [
        { name: "Cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 1 },
        { name: "Extra pickles", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 50, sortOrder: 2 },
        { name: "Gluten Free Bun", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 149, sortOrder: 3 },
        { name: "Coleslaw", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Pickles", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 2 },
        { name: "Spicy sauce", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 3 }
      ]
    },
    {
      name: "Chicken Salad Bowl",
      slug: "chicken-salad-bowl",
      description: "Salads with Protein. Greens, chicken, veggies, cheese with ranch.",
      basePriceCents: 1199,
      options: [
        { name: "Extra chicken", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 250, sortOrder: 1 },
        { name: "Extra cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 2 },
        { name: "Cheese", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Ranch", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 2 },
        { name: "Veggies", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 3 }
      ]
    },
    {
      name: "Beef Salad Bowl",
      slug: "beef-salad-bowl",
      description: "Salads with Protein. Grilled beef over greens with parmesan and dressing.",
      basePriceCents: 1199,
      options: [
        { name: "Extra beef", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 250, sortOrder: 1 },
        { name: "Extra parmesan", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 2 },
        { name: "Parmesan", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Dressing", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 2 }
      ]
    },
    {
      name: "Mac n' Cheese",
      slug: "mac-n-cheese",
      description: "Comfort Favorites. Creamy cheddar and mozzarella blend.",
      basePriceCents: 799,
      options: [
        { name: "Extra cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 1 },
        { name: "Bacon", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 200, sortOrder: 2 }
      ]
    },
    {
      name: "Chicken Quesadilla",
      slug: "chicken-quesadilla",
      description: "Comfort Favorites. Grilled tortilla with chicken and cheese.",
      basePriceCents: 899,
      options: [
        { name: "Extra chicken", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 200, sortOrder: 1 },
        { name: "Extra cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 2 },
        { name: "Cheese", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 }
      ]
    },
    {
      name: "Beef Quesadilla",
      slug: "beef-quesadilla",
      description: "Comfort Favorites. Seasoned beef with melted cheese.",
      basePriceCents: 899,
      options: [
        { name: "Extra beef", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 200, sortOrder: 1 },
        { name: "Extra cheese", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 100, sortOrder: 2 },
        { name: "Cheese", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 }
      ]
    },
    {
      name: "4pc Chicken Wings",
      slug: "chicken-wings-4pc",
      description: "Comfort Favorites. Required flavor choice for each order.",
      basePriceCents: 999,
      options: [
        { name: "BBQ", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -4 },
        { name: "Spicy BBQ", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -3 },
        { name: "Buffalo", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -2 },
        { name: "Lemon Pepper", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: -1 },
        { name: "Ranch dip", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 75, sortOrder: 1 }
      ]
    },
    {
      name: "Chicken Tenders (3PC without Fries)",
      slug: "chicken-tenders",
      description: "Comfort Favorites. Served with dipping sauces.",
      basePriceCents: 999,
      options: [
        { name: "BBQ sauce", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Ranch dip", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: 2 }
      ]
    },
    {
      name: "Chicken Tenders (2 PC with Fries)",
      slug: "chicken-tenders-fries",
      description: "Comfort Favorites. Includes fries and sauce.",
      basePriceCents: 999,
      options: [
        { name: "BBQ sauce", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Ranch dip", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: 2 },
        { name: "Fries", optionType: MenuOptionType.REMOVAL, priceDeltaCents: 0, sortOrder: 1 }
      ]
    },
    {
      name: "Fries",
      slug: "fries",
      description: "Sides & Snacks. Crispy and golden.",
      basePriceCents: 499,
      options: [
        { name: "Ranch dip", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 75, sortOrder: 1 },
        { name: "Ketchup packets", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: 2 }
      ]
    },
    {
      name: "Tots",
      slug: "tots",
      description: "Sides & Snacks. Crispy and golden.",
      basePriceCents: 499,
      options: [
        { name: "Ranch dip", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 75, sortOrder: 1 },
        { name: "Ketchup packets", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: 2 }
      ]
    },
    {
      name: "Onion Rings",
      slug: "onion-rings",
      description: "Sides & Snacks. Lightly battered and fried.",
      basePriceCents: 699,
      options: [
        { name: "Ranch dip", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 75, sortOrder: 1 }
      ]
    },
    {
      name: "Mozzarella Sticks",
      slug: "mozzarella-sticks",
      description: "Sides & Snacks. Crispy with melted cheese.",
      basePriceCents: 599,
      options: [
        { name: "Marinara", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 0, sortOrder: 1 },
        { name: "Ranch dip", optionType: MenuOptionType.ADD_ON, priceDeltaCents: 75, sortOrder: 2 }
      ]
    },
    {
      name: "Large Brownie",
      slug: "large-brownie",
      description: "Sides & Snacks. Large brownie.",
      basePriceCents: 499,
      options: []
    },
    {
      name: "Large Choc Chip Cookie",
      slug: "large-choc-chip-cookie",
      description: "Sides & Snacks. Large chocolate chip cookie.",
      basePriceCents: 399,
      options: []
    },
    {
      name: "Churro Cake",
      slug: "churro-cake",
      description: "Sides & Snacks. Churro cake.",
      basePriceCents: 499,
      options: []
    }
  ];

  const items = [];
  for (const definition of menuDefinitions) {
    const item = await prisma.menuItem.upsert({
      where: { slug: definition.slug },
      update: {
        name: definition.name,
        description: definition.description,
        basePriceCents: definition.basePriceCents,
        isActive: true
      },
      create: {
        name: definition.name,
        slug: definition.slug,
        description: definition.description,
        basePriceCents: definition.basePriceCents,
        isActive: true
      }
    });

    await prisma.menuOption.deleteMany({ where: { menuItemId: item.id } });
    if (definition.options.length) {
      await prisma.menuOption.createMany({
        data: definition.options.map((option) => ({
          menuItemId: item.id,
          ...option
        }))
      });
    }

    items.push(item);
  }

  const deliveryOffsets = nextBusinessDayOffsets(10);

  for (const school of schools) {
    for (const daysOut of deliveryOffsets) {
      const deliveryDate = zonedDateAt(daysOut, 11, 0);
      const cutoffBase = addDays(deliveryDate, -1);
      const cutoffAt = set(cutoffBase, {
        hours: school.defaultCutoffHour,
        minutes: school.defaultCutoffMinute,
        seconds: 0,
        milliseconds: 0
      });

      const dateRecord = await prisma.deliveryDate.upsert({
        where: {
          schoolId_deliveryDate: {
            schoolId: school.id,
            deliveryDate
          }
        },
        update: {
          cutoffAt
        },
        create: {
          schoolId: school.id,
          deliveryDate,
          cutoffAt,
          orderingOpen: true,
          notes: "Seeded demo delivery date"
        }
      });

      // Neon (pooler + scale-to-zero) occasionally drops the connection after a
      // long series of sequential single-row upserts — the seed used to die
      // here with P1017 ("Server has closed the connection") ~halfway through.
      // Batch all menu-item upserts for this delivery date into one
      // interactive transaction so it's a single round trip using one session.
      await prisma.$transaction(
        items.map((item) =>
          prisma.deliveryMenuItem.upsert({
            where: {
              deliveryDateId_menuItemId: {
                deliveryDateId: dateRecord.id,
                menuItemId: item.id
              }
            },
            update: {},
            create: {
              schoolId: school.id,
              deliveryDateId: dateRecord.id,
              menuItemId: item.id,
              isAvailable: true
            }
          })
        )
      );
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
