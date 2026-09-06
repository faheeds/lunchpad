import { OrderStatus, PaymentStatus, WeeklyCheckoutStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { resolveLineItemPrice } from "@/lib/pricing";
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
              options: true,
              sizes: true
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

    const requiredChoices = getRequiredChoicesForMenuItem(plan.menuItem);
    if (requiredChoices.length && (!plan.choice || !requiredChoices.includes(plan.choice))) {
      skippedItems.push(
        `${weekdayLabel}: ${plan.parentChild.studentName} - ${plan.menuItem.name} is missing a required choice.`
      );
      return [];
    }

    // Resolve the size-variant price. When the menu item has sizes the
    // plan must carry a valid one, otherwise the line would silently
    // fall back to basePriceCents (often 0 for sized items) — so skip
    // with an error, mirroring the requiredChoice guard above.
    const itemSizes = plan.menuItem.sizes;
    let resolvedBaseCents = plan.menuItem.basePriceCents;
    if (itemSizes.length) {
      const matchedSize = plan.size
        ? itemSizes.find((size) => size.name === plan.size)
        : undefined;
      if (!matchedSize) {
        skippedItems.push(
          `${weekdayLabel}: ${plan.parentChild.studentName} - ${plan.menuItem.name} is missing a size selection.`
        );
        return [];
      }
      resolvedBaseCents = matchedSize.priceCents;
    }

    const lineTotalCents = resolveLineItemPrice({
      basePriceCents: resolvedBaseCents,
      additions: plan.menuItem.options.filter(
        (option) => option.optionType === "ADD_ON" && plan.additions.includes(option.name)
      ),
    });

    return [
      {
        parentChildId: plan.parentChildId,
        schoolId: plan.schoolId,
        deliveryDateId: matchingDeliveryDate.id,
        menuItemId: plan.menuItemId,
        choice: plan.choice,
        size: plan.size,
        additions: plan.additions,
        removals: plan.removals,
        itemNameSnapshot: plan.menuItem.name,
        basePriceCents: resolvedBaseCents,
        lineTotalCents
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

  // Derive restaurantId from the first school on the plan (all plans for one
  // parent within a weekly checkout belong to one restaurant).
  const firstSchool = eligibleDeliveryDates[0]?.school;
  const restaurantId = firstSchool
    ? (await prisma.school.findUnique({ where: { id: firstSchool.id }, select: { restaurantId: true } }))?.restaurantId
    : null;

  if (!restaurantId) {
    throw new Error("Could not determine restaurant for weekly checkout.");
  }

  return prisma.weeklyCheckoutBatch.create({
    data: {
      parentUserId,
      restaurantId,
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

/**
 * Builds a WeeklyCheckoutBatch from a live, ad-hoc cart submitted by the
 * mobile app for a single delivery date — as opposed to
 * createWeeklyCheckoutBatch, which reads pre-saved WeeklyLunchPlan rows.
 * Reuses the exact same WeeklyCheckoutBatch/WeeklyCheckoutBatchItem models
 * and the exact same downstream payment/webhook path
 * (createWeeklyStripeCheckoutSession + markWeeklyBatchPaidByCheckoutSession
 * are both already generic and need zero changes) — this function's only
 * job is validating client-submitted cart data with the same rigor
 * createWeeklyCheckoutBatch already applies to server-read weekly-plan
 * data, since a mobile client cannot be trusted to submit correct prices,
 * valid children, or valid delivery-date/menu-item combinations.
 *
 * This is how a single cart with items for multiple different children
 * becomes multiple separate Order rows after payment — each
 * WeeklyCheckoutBatchItem always becomes exactly one Order (existing
 * behavior in markWeeklyBatchPaidByCheckoutSession, unchanged), so three
 * items for three different kids in one cart produces three Orders,
 * correctly attributed, from one payment.
 */
export async function createAdHocCheckoutBatch(
  parentUserId: string,
  deliveryDateId: string,
  cartItems: {
    parentChildId: string;
    menuItemId: string;
    choice?: string | null;
    size?: string | null;
    additions: string[];
    removals: string[];
  }[]
) {
  if (!cartItems.length) {
    throw new Error("Cart is empty.");
  }

  const now = new Date();

  const deliveryDate = await prisma.deliveryDate.findUnique({
    where: { id: deliveryDateId },
    include: {
      school: true,
      menuAvailability: {
        where: { isAvailable: true },
        include: { menuItem: { include: { options: true, sizes: true } } }
      }
    }
  });

  if (!deliveryDate) {
    throw new Error("Delivery date not found.");
  }
  if (!deliveryDate.orderingOpen || deliveryDate.cutoffAt <= now) {
    throw new Error("Ordering has closed for this delivery date.");
  }

  const restaurantId = (
    await prisma.school.findUnique({
      where: { id: deliveryDate.schoolId },
      select: { restaurantId: true }
    })
  )?.restaurantId;
  if (!restaurantId) {
    throw new Error("Could not determine restaurant for this order.");
  }

  // Verify every referenced child actually belongs to the authenticated
  // parent, not just that a parentChildId string was supplied. This is
  // the one check createWeeklyCheckoutBatch doesn't need (its data comes
  // from parent.weeklyPlans, already scoped by definition) but is
  // essential here since the client submits parentChildId directly.
  const childIds = [...new Set(cartItems.map((item) => item.parentChildId))];
  const children = await prisma.parentChild.findMany({
    where: { id: { in: childIds }, parentUserId, archivedAt: null }
  });
  const childById = new Map(children.map((c) => [c.id, c]));
  const missingChild = childIds.find((id) => !childById.has(id));
  if (missingChild) {
    throw new Error("One of the selected eaters could not be verified.");
  }

  // Every assigned child's own home school must match the delivery
  // date's school. Without this check, a cart built against the wrong
  // campus's delivery date would silently create a real, paid order
  // attributing a child to a school they don't actually attend --
  // exactly the bug this check exists to prevent, found via a real
  // multi-campus test order.
  const wrongSchoolChild = children.find((c) => c.schoolId !== deliveryDate.schoolId);
  if (wrongSchoolChild) {
    throw new Error(
      `${wrongSchoolChild.studentName} is registered at a different location than this delivery date. Double-check the delivery date matches each child's school.`
    );
  }

  const skippedItems: string[] = [];

  const batchItems = cartItems.flatMap((cartItem) => {
    const child = childById.get(cartItem.parentChildId)!;
    const availability = deliveryDate.menuAvailability.find(
      (entry) => entry.menuItemId === cartItem.menuItemId
    );
    if (!availability) {
      skippedItems.push(`${child.studentName}'s item is no longer available for this delivery date.`);
      return [];
    }

    const menuItem = availability.menuItem;
    const requiredChoices = getRequiredChoicesForMenuItem(menuItem);
    if (requiredChoices.length && (!cartItem.choice || !requiredChoices.includes(cartItem.choice))) {
      skippedItems.push(`${child.studentName}'s ${menuItem.name} is missing a required choice.`);
      return [];
    }

    let resolvedBaseCents = menuItem.basePriceCents;
    if (menuItem.sizes.length) {
      const matchedSize = cartItem.size
        ? menuItem.sizes.find((size) => size.name === cartItem.size)
        : undefined;
      if (!matchedSize) {
        skippedItems.push(`${child.studentName}'s ${menuItem.name} is missing a size selection.`);
        return [];
      }
      resolvedBaseCents = matchedSize.priceCents;
    }

    const lineTotalCents = resolveLineItemPrice({
      basePriceCents: resolvedBaseCents,
      additions: menuItem.options.filter(
        (option) => option.optionType === "ADD_ON" && cartItem.additions.includes(option.name)
      )
    });

    return [
      {
        parentChildId: cartItem.parentChildId,
        schoolId: deliveryDate.schoolId,
        deliveryDateId: deliveryDate.id,
        menuItemId: cartItem.menuItemId,
        choice: cartItem.choice ?? null,
        size: cartItem.size ?? null,
        additions: cartItem.additions,
        removals: cartItem.removals,
        itemNameSnapshot: menuItem.name,
        basePriceCents: resolvedBaseCents,
        lineTotalCents
      }
    ];
  });

  if (skippedItems.length) {
    throw new Error(`Checkout could not continue. ${skippedItems.join(" ")}`);
  }

  const totalCents = batchItems.reduce((sum, item) => sum + item.lineTotalCents, 0);

  return prisma.weeklyCheckoutBatch.create({
    data: {
      parentUserId,
      restaurantId,
      totalCents,
      items: { create: batchItems }
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
          restaurantId: batch.restaurantId,
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
              sizeName: item.size,
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
