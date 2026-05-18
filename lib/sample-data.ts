import { prisma } from "@/lib/db";
import { fromZonedTime } from "date-fns-tz";
import { slugify } from "@/lib/utils";
import { nextFriday } from "date-fns";

export const SAMPLE_DATA_PREFIX = "[Sample] ";

export const SAMPLE_SCHOOL_NAME = `${SAMPLE_DATA_PREFIX}Sample Elementary`;

export const SAMPLE_MENU_ITEMS = [
  { name: "Caesar Salad", basePriceCents: 650 },
  { name: "Turkey Wrap", basePriceCents: 795 },
  { name: "Cheese Pizza", basePriceCents: 595 },
  { name: "Fruit Cup", basePriceCents: 325 },
  { name: "Bottled Water", basePriceCents: 195 },
];

export async function seedSampleData(restaurantId: string): Promise<{
  schoolId: string;
  menuItemIds: string[];
  deliveryDateId: string;
}> {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
  });

  const timezone = restaurant.timezone || "America/Los_Angeles";

  // Create school
  const school = await prisma.school.create({
    data: {
      restaurantId,
      name: SAMPLE_SCHOOL_NAME,
      slug: slugify(SAMPLE_SCHOOL_NAME),
      locationType: restaurant.operatorType === "office" ? "OFFICE" : "SCHOOL",
      timezone,
      defaultCutoffHour: 21,
      defaultCutoffMinute: 0,
      collectTeacher: restaurant.operatorType !== "office",
      collectClassroom: restaurant.operatorType !== "office",
      isActive: true,
    },
  });

  // Create menu items
  const menuItems = await Promise.all(
    SAMPLE_MENU_ITEMS.map((item) =>
      prisma.menuItem.create({
        data: {
          restaurantId,
          name: `${SAMPLE_DATA_PREFIX}${item.name}`,
          slug: slugify(`${SAMPLE_DATA_PREFIX}${item.name}`),
          basePriceCents: item.basePriceCents,
          isActive: true,
          dietaryTags: [],
        },
      })
    )
  );

  // Create upcoming delivery date (next Friday at 11am)
  const nextFri = nextFriday(new Date());
  const deliveryDateTime = fromZonedTime(
    `${nextFri.toISOString().slice(0, 10)} 11:00:00`,
    timezone
  );

  // Cutoff is 1 hour before delivery
  const cutoffDateTime = fromZonedTime(
    `${nextFri.toISOString().slice(0, 10)} 10:00:00`,
    timezone
  );

  const deliveryDate = await prisma.deliveryDate.create({
    data: {
      schoolId: school.id,
      deliveryDate: deliveryDateTime,
      cutoffAt: cutoffDateTime,
      orderingOpen: true,
    },
  });

  // Link menu items to delivery date
  await prisma.deliveryMenuItem.createMany({
    data: menuItems.map((item) => ({
      deliveryDateId: deliveryDate.id,
      menuItemId: item.id,
      schoolId: school.id,
      isAvailable: true,
    })),
  });

  return {
    schoolId: school.id,
    menuItemIds: menuItems.map((m) => m.id),
    deliveryDateId: deliveryDate.id,
  };
}

export async function resetSampleData(restaurantId: string): Promise<{
  schoolsDeleted: number;
  menuItemsDeleted: number;
  deliveryDatesDeleted: number;
}> {
  const prefix = SAMPLE_DATA_PREFIX;

  // Delete schools with sample name
  const schoolsDeleted = await prisma.school.deleteMany({
    where: {
      restaurantId,
      name: { startsWith: prefix },
    },
  });

  // Delete menu items with sample names
  const menuItemsDeleted = await prisma.menuItem.deleteMany({
    where: {
      restaurantId,
      name: { startsWith: prefix },
    },
  });

  // Delivery dates cascade-delete when school is deleted, so we don't need to explicitly delete them.
  // But we can count them for the response.
  const deliveryDatesDeleted = await prisma.deliveryDate.count({
    where: {
      school: { restaurantId, name: { startsWith: prefix } },
    },
  });

  return {
    schoolsDeleted: schoolsDeleted.count,
    menuItemsDeleted: menuItemsDeleted.count,
    deliveryDatesDeleted: deliveryDatesDeleted,
  };
}
