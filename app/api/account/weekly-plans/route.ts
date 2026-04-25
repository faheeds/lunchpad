import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertParentApiRequest } from "@/lib/parent-auth";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { getUpcomingOrderingWindowRange, getWeekdayNumber } from "@/lib/weekly-week";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday"
};

export async function POST(request: Request) {
  try {
    const session = await assertParentApiRequest();
    const parentUserId = session.user?.parentUserId;
    if (!parentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parentChildId = String(body.parentChildId || "");
    const menuItemId = String(body.menuItemId || "");
    const weekday = Number(body.weekday);
    const choice = String(body.choice || "") || null;
    const additions = Array.isArray(body.additions) ? body.additions.map(String) : [];
    const removals = Array.isArray(body.removals) ? body.removals.map(String) : [];

    const parentChild = await prisma.parentChild.findFirst({
      where: { id: parentChildId, parentUserId, archivedAt: null },
      include: { school: true }
    });

    if (!parentChild) {
      return NextResponse.json({ error: "Saved child not found." }, { status: 404 });
    }

    const menuItem = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: { options: true }
    });

    if (!menuItem) {
      return NextResponse.json({ error: "Menu item not found." }, { status: 404 });
    }

    const now = new Date();
    const range = getUpcomingOrderingWindowRange(now, parentChild.school.timezone);
    const deliveryDates = await prisma.deliveryDate.findMany({
      where: {
        schoolId: parentChild.schoolId,
        orderingOpen: true,
        cutoffAt: { gt: now },
        deliveryDate: { gte: range.start, lte: range.end }
      },
      include: {
        menuAvailability: {
          where: { isAvailable: true },
          select: { menuItemId: true }
        }
      },
      orderBy: { deliveryDate: "asc" }
    });

    const weekdayLabel = WEEKDAY_LABELS[weekday] ?? `Day ${weekday}`;
    const matchingDeliveryDate = deliveryDates.find(
      (deliveryDate) => getWeekdayNumber(deliveryDate.deliveryDate, parentChild.school.timezone) === weekday
    );

    if (!matchingDeliveryDate) {
      return NextResponse.json(
        { error: `Cannot add meals for ${weekdayLabel} because no delivery date is scheduled yet.` },
        { status: 400 }
      );
    }

    const availableMenuItemIds = new Set(matchingDeliveryDate.menuAvailability.map((entry) => entry.menuItemId));
    if (!availableMenuItemIds.has(menuItemId)) {
      return NextResponse.json(
        { error: `${menuItem.name} is not available for ${weekdayLabel}. Choose a different item.` },
        { status: 400 }
      );
    }

    const requiredChoices = getRequiredChoicesForMenuItem(menuItem.slug);
    if (requiredChoices.length && (!choice || !requiredChoices.includes(choice))) {
      return NextResponse.json({ error: `Choose a required option for ${menuItem.name}.` }, { status: 400 });
    }

    const addOnSet = new Set(
      menuItem.options.filter((option) => option.optionType === "ADD_ON").map((option) => option.name)
    );
    const removalSet = new Set(
      menuItem.options.filter((option) => option.optionType === "REMOVAL").map((option) => option.name)
    );

    if (!additions.every((value: string) => addOnSet.has(value))) {
      return NextResponse.json({ error: `One or more add-ons are invalid for ${menuItem.name}.` }, { status: 400 });
    }

    if (!removals.every((value: string) => removalSet.has(value))) {
      return NextResponse.json({ error: `One or more removals are invalid for ${menuItem.name}.` }, { status: 400 });
    }

    const existingCount = await prisma.weeklyLunchPlan.count({
      where: { parentChildId, weekday }
    });

    const plan = await prisma.weeklyLunchPlan.create({
      data: {
        parentUserId,
        parentChildId,
        schoolId: parentChild.schoolId,
        weekday,
        menuItemId,
        choice,
        additions,
        removals,
        sortOrder: existingCount,
        isActive: true
      }
    });

    return NextResponse.json({ id: plan.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save weekly plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await assertParentApiRequest();
    const parentUserId = session.user?.parentUserId;
    if (!parentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const planId = String(body.planId || "");
    const isActive = Boolean(body.isActive);

    const plan = await prisma.weeklyLunchPlan.findFirst({
      where: { id: planId, parentUserId }
    });

    if (!plan) {
      return NextResponse.json({ error: "Weekly plan not found." }, { status: 404 });
    }

    await prisma.weeklyLunchPlan.update({
      where: { id: planId },
      data: { isActive }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update weekly plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await assertParentApiRequest();
    const parentUserId = session.user?.parentUserId;
    if (!parentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const planId = String(body.planId || "");

    const plan = await prisma.weeklyLunchPlan.findFirst({
      where: { id: planId, parentUserId }
    });

    if (!plan) {
      return NextResponse.json({ error: "Weekly plan not found." }, { status: 404 });
    }

    await prisma.weeklyLunchPlan.delete({
      where: { id: planId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove weekly plan item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
