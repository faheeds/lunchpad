import { OrderStatus, PaymentStatus, WeeklyCheckoutStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
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

function buildOrderNumber(timezone: string) {
  return `SL-${formatInTimeZone(new Date(), timezone, "yyyyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function distributeExtraCents(baseAmounts: number[], totalWithExtra: number) {
  const subtotal = baseAmounts.reduce((sum, value) => sum + value, 0);
  if (!subtotal || totalWithExtra <= subtotal) {
    return [...baseAmounts];
  }

  const extra = totalWithExtra - subtotal;
  let remainingExtra = extra;

  return baseAmounts.map((amount, index) => {
    if (index === baseAmounts.length - 1) {
      return amount + remainingExtra;
    }

    const allocated = Math.floor((extra * amount) / subtotal);
    remainingExtra -= allocated;
    return amount + allocated;
  });
}

export async function createWeeklyCheckoutBatch(parentUserId: string) {
  const parent = await prisma.parentUser.findUnique({
    where: { id: parentUserId },
    include: {
      weeklyPlans: {
        where: {
          isActive: true,
          parentChild: {
            archivedAt: null
          }
        },
        include: {
          parentChild: true,
          school: true,
          menuItem: {
            include: {
              options: true
            }
          }
        },
        orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!parent) {
    throw new Error("Parent account not found.");
  }

  if (!parent.weeklyPlans.length) {
    throw new Error("No active weekly lunch plans found.");
  }

  const now = new Date();
  const primaryTimezone = parent.weeklyPlans[0]?.school.timezone ?? "America/Los_Angeles";
  const targetRange = getUpcomingOrderingWindowRange(now, primaryTimezone);
  const schoolIds = [...new Set(parent.weeklyPlans.map((plan) => plan.schoolId))];

  const allWeekDeliveryDates = await prisma.deliveryDate.findMany({
    where: {
      deliveryDate: {
        gte: targetRange.start,
        lte: targetRange.end
      },
      schoolId: { in: schoolIds }
    },
    include: {
      school: true,
      menuAvailability: {
        where: { isAvailable: true },
        include: {
          menuItem: {
            include: { options: true }
          }
        }
      }
    },
    orderBy: { deliveryDate: "asc" }
  });

  if (!allWeekDeliveryDates.length) {
    throw new Error("No upcoming delivery dates are available for the saved children on this plan.");
  }

  const eligibleDeliveryDates = allWeekDeliveryDates.filter(
    (deliveryDate) => deliveryDate.orderingOpen && deliveryDate.cutoffAt > now
  );

  if (!eligibleDeliveryDates.length) {
    throw new Error("Ordering has closed for every delivery date in the upcoming lunch week.");
  }

  const skippedItems: string[] = [];

  const batchItems = parent.weeklyPlans.flatMap((plan) => {
    const weekdayLabel = WEEKDAY_LABELS[plan.weekday] ?? `Day ${plan.weekday}`;
    const matchingDeliveryDate = eligibleDeliveryDates.find(
      (deliveryDate) =>
        deliveryDate.schoolId === plan.schoolId &&
        getWeekdayNumber(deliveryDate.deliveryDate, deliveryDate.school.timezone) === plan.weekday
    );

    if (!matchingDeliveryDate) {
      const sameDayDelivery = allWeekDeliveryDates.find(
        (deliveryDate) =>
          deliveryDate.schoolId === plan.schoolId &&
          getWeekdayNumber(deliveryDate.deliveryDate, deliveryDate.school.timezone) === plan.weekday
      );

      skippedItems.push(
        sameDayDelivery
          ? `${weekdayLabel}: ${plan.parentChild.studentName} - ${plan.menuItem.name} could not be included because ordering is already closed.`
          : `${weekdayLabel}: ${plan.parentChild.studentName} - ${plan.menuItem.name} could not be included because no delivery date is scheduled.`
      );
      return [];
    }

    const availability = matchingDeliveryDate.menuAvailability.find((entry) => entry.menuItemId === plan.menuItemId);
    if (!availability) {
      skippedItems.push(
        `${weekdayLabel}: ${plan.parentChild.studentName} - ${plan.menuItem.name} is unavailable for ${matchingDeliveryDate.school.name}.`
      );
      return [];
    }

    const requiredChoices = getRequiredChoicesForMenuItem(plan.menuItem.slug);
    if (requiredChoices.length && (!plan.choice || !requiredChoices.includes(plan.choice))) {
      skippedItems.push(
        `${weekdayLabel}: ${plan.parentChild.studentName} - ${plan.menuItem.name} is missing a required choice.`
      );
      return [];
    }

    const addOnCost = plan.menuItem.options
      .filter((option) => option.optionType === "ADD_ON" && plan.additions.includes(option.name))
      .reduce((sum, option) => sum + option.priceDeltaCents, 0);

    return [
      {
        parentChildId: plan.parentChildId,
        schoolId: plan.schoolId,
        deliveryDateId: matchingDeliveryDate.id,
        menuItemId: plan.menuItemId,
        choice: plan.choice,
        additions: plan.additions,
        removals: plan.removals,
        itemNameSnapshot: plan.menuItem.name,
        basePriceCents: plan.menuItem.basePriceCents,
        lineTotalCents: plan.menuItem.basePriceCents + addOnCost
      }
    ];
  });

  if (skippedItems.length) {
    throw new Error(`Weekly checkout could not continue. ${skippedItems.join(" ")}`);
  }

  if (!batchItems.length) {
    throw new Error("No delivery dates in the upcoming lunch week matched the planned items.");
  }

  const totalCents = batchItems.reduce((sum, item) => sum + item.lineTotalCents, 0);

  return prisma.weeklyCheckoutBatch.create({
    data: {
      parentUserId,
      totalCents,
      items: {
        create: batchItems
      }
    },
    include: {
      items: {
        include: {
          parentChild: true,
          deliveryDate: { include: { school: true } }
        }
      },
      parentUser: true
    }
  });
}

export async function markWeeklyBatchPaidByCheckoutSession(
  sessionId: string,
  paymentIntentId?: string | null,
  amountTotalCents?: number | null
) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.weeklyCheckoutBatch.findFirst({
      where: { checkoutSessionId: sessionId },
      include: {
        parentUser: true,
        items: {
          include: {
            parentChild: true,
            school: true,
            deliveryDate: { include: { school: true } }
          }
        }
      }
    });

    if (!batch) {
      throw new Error("Weekly checkout batch not found for session.");
    }

    if (batch.status === WeeklyCheckoutStatus.PAID) {
      return { batch, createdOrderIds: [] as string[] };
    }

    const allocatedTotals = distributeExtraCents(
      batch.items.map((item) => item.lineTotalCents),
      amountTotalCents ?? batch.totalCents
    );

    const paidAt = new Date();
    const createdOrderIds: string[] = [];

    for (const [index, item] of batch.items.entries()) {
      const student = await tx.student.create({
        data: {
          schoolId: item.schoolId,
          studentName: item.parentChild.studentName,
          grade: item.parentChild.grade,
          teacherName: item.parentChild.teacherName,
          classroom: item.parentChild.classroom,
          allergyNotes: item.parentChild.allergyNotes,
          dietaryNotes: item.parentChild.dietaryNotes
        }
      });

      const order = await tx.order.create({
        data: {
          orderNumber: buildOrderNumber(item.deliveryDate.school.timezone),
          schoolId: item.schoolId,
          deliveryDateId: item.deliveryDateId,
          studentId: student.id,
          parentUserId: batch.parentUserId,
          parentChildId: item.parentChildId,
          parentName: batch.parentUser.name || batch.parentUser.email,
          parentEmail: batch.parentUser.email,
          subtotalCents: item.lineTotalCents,
          totalCents: allocatedTotals[index],
          status: OrderStatus.PAID,
          paidAt,
          items: {
            create: {
              menuItemId: item.menuItemId,
              itemNameSnapshot: item.itemNameSnapshot,
              basePriceCents: item.basePriceCents,
              additions: item.choice ? [item.choice, ...item.additions] : item.additions,
              removals: item.removals,
              allergyNotes: item.parentChild.allergyNotes,
              dietaryNotes: item.parentChild.dietaryNotes,
              lineTotalCents: item.lineTotalCents
            }
          },
          payment: {
            create: {
              provider: "stripe-weekly-batch",
              amountCents: allocatedTotals[index],
              status: PaymentStatus.PAID,
              paidAt
            }
          }
        }
      });
      createdOrderIds.push(order.id);
    }

    const updatedBatch = await tx.weeklyCheckoutBatch.update({
      where: { id: batch.id },
      data: {
        status: WeeklyCheckoutStatus.PAID,
        paymentIntentId: paymentIntentId ?? batch.paymentIntentId,
        paidAt,
        totalCents: amountTotalCents ?? batch.totalCents
      },
      include: {
        parentUser: true,
        items: {
          include: {
            parentChild: true,
            deliveryDate: { include: { school: true } }
          }
        }
      }
    });

    await tx.weeklyLunchPlan.deleteMany({
      where: { parentUserId: batch.parentUserId }
    });

    return { batch: updatedBatch, createdOrderIds };
  });
}
