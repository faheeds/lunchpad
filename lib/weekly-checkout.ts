import { OrderStatus, PaymentStatus, WeeklyCheckoutStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { resolveLineItemPrice } from "@/lib/pricing";
import { getUpcomingOrderingWindowRange, getWeekdayNumber } from "@/lib/weekly-week";
import { assertOrderCapacity } from "@/lib/orders";
import { pickApplicableDiscounts } from "@/lib/discounts";
import { logActivity } from "@/lib/activity";
import { formatCurrency } from "@/lib/utils";

/**
 * Scores one batch item's discount independently of every other item in
 * the same batch — eligibility (most importantly firstOrderOnly) is
 * evaluated per child (studentName + grade), so two kids in the same
 * cart can legitimately get different discounts, or one can qualify for
 * the welcome offer while a sibling doesn't. This mirrors exactly what
 * lib/orders.ts's createPendingOrder already does for a single-item
 * checkout — this is that same call, just made once per batch item.
 *
 * NOTE: a promo `code` with maxRedemptionsPerUser is checked against
 * already-persisted redemptions, so two items in the SAME batch can
 * both win the same limited code (its redemption rows don't exist yet
 * to count against each other) — same accepted race class the capacity
 * check above already documents; a real-world code should rarely have
 * enough volume in one cart for this to matter.
 */
async function scoreItemDiscount(args: {
  restaurantId: string;
  schoolId: string;
  deliveryDate: Date;
  parentUserId: string;
  studentName: string;
  grade: string | null;
  menuItemId: string;
  category: string | null;
  lineTotalCents: number;
  code?: string | null;
}) {
  const result = await pickApplicableDiscounts({
    cart: {
      restaurantId: args.restaurantId,
      schoolId: args.schoolId,
      deliveryDate: args.deliveryDate,
      parentUserId: args.parentUserId,
      grade: args.grade,
      studentName: args.studentName,
      lines: [{ menuItemId: args.menuItemId, category: args.category, lineTotalCents: args.lineTotalCents }],
    },
    code: args.code,
  });
  const winning = result.code ?? result.auto;
  return {
    discountId: winning?.discount.id ?? null,
    discountCents: winning?.amountCents ?? 0,
    discountName: winning?.discount.name ?? null,
  };
}

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

/**
 * Proportionally reallocates each item's share of the ACTUAL amount
 * Stripe charged (amountTotalCents from the webhook) against each
 * item's raw (gross, pre-discount) lineTotalCents, so every Order's
 * totalCents adds up to exactly what was paid.
 *
 * Renamed from the old distributeExtraCents, which only handled the
 * actual total being >= the raw subtotal (i.e. only ever added tax on
 * top) and silently returned the untouched gross amounts whenever the
 * actual total came in lower — which is exactly what happens whenever a
 * discount applies (actual = gross - discount + tax, and a typical
 * discount is bigger than tax). That meant a paid Order's totalCents
 * could show the full undiscounted price even though the customer paid
 * less. This version scales correctly either direction; the last item
 * still absorbs the rounding remainder so the sum matches exactly.
 */
function allocateActualTotal(baseAmounts: number[], actualTotalCents: number) {
  const subtotal = baseAmounts.reduce((sum, value) => sum + value, 0);
  if (!subtotal || actualTotalCents === subtotal) {
    return [...baseAmounts];
  }

  let remaining = actualTotalCents;

  return baseAmounts.map((amount, index) => {
    if (index === baseAmounts.length - 1) {
      return remaining;
    }

    const share = Math.round((actualTotalCents * amount) / subtotal);
    remaining -= share;
    return share;
  });
}

export async function createWeeklyCheckoutBatch(parentUserId: string, code?: string | null) {
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

  // Same monthly order cap as a regular checkout — check before building
  // out a multi-day batch. This is a soft check against the count as of
  // right now (not reserving capacity for every day in the batch), same
  // tolerance the discount engine below documents: a race past the cap
  // is harmless and rare for a usage-based SaaS limit like this one.
  await assertOrderCapacity(parent.weeklyPlans[0].school.restaurantId);

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

  // Derive restaurantId from the first school on the plan (all plans for one
  // parent within a weekly checkout belong to one restaurant). Needed up
  // front now, not just for the final create — each item's discount score
  // below requires it.
  const firstSchool = eligibleDeliveryDates[0]?.school;
  const restaurantId = firstSchool
    ? (await prisma.school.findUnique({ where: { id: firstSchool.id }, select: { restaurantId: true } }))?.restaurantId
    : null;

  if (!restaurantId) {
    throw new Error("Could not determine restaurant for weekly checkout.");
  }

  const skippedItems: string[] = [];

  const batchItemGroups = await Promise.all(parent.weeklyPlans.map(async (plan) => {
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

    const { discountId, discountCents } = await scoreItemDiscount({
      restaurantId,
      schoolId: plan.schoolId,
      deliveryDate: matchingDeliveryDate.deliveryDate,
      parentUserId,
      studentName: plan.parentChild.studentName,
      grade: plan.parentChild.grade ?? null,
      menuItemId: plan.menuItemId,
      category: plan.menuItem.category ?? null,
      lineTotalCents,
      code,
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
        lineTotalCents,
        discountId,
        discountCents
      }
    ];
  }));

  const batchItems = batchItemGroups.flat();

  if (skippedItems.length) {
    throw new Error(`Weekly checkout could not continue. ${skippedItems.join(" ")}`);
  }

  if (!batchItems.length) {
    throw new Error("No delivery dates in the upcoming lunch week matched the planned items.");
  }

  const subtotalCents = batchItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const discountCents = batchItems.reduce((sum, item) => sum + item.discountCents, 0);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  return prisma.weeklyCheckoutBatch.create({
    data: {
      parentUserId,
      restaurantId,
      subtotalCents,
      discountCents,
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
 * mobile app for one or more delivery dates — as opposed to
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
 * Each cart item carries its own deliveryDateId (not one shared for the
 * whole cart) so a single checkout can include children at different
 * schools ordering on the same day — each item is independently
 * validated against its own assigned child's actual school, so a child
 * can never be attributed to a delivery date at a school they don't
 * attend, regardless of what else is in the same cart.
 *
 * This is how a single cart with items for multiple different children
 * (at the same school or different schools) becomes multiple separate
 * Order rows after payment — each WeeklyCheckoutBatchItem always becomes
 * exactly one Order (existing behavior in
 * markWeeklyBatchPaidByCheckoutSession, unchanged), so three items for
 * three different kids in one cart produces three Orders, correctly
 * attributed, from one payment.
 */
export async function createAdHocCheckoutBatch(
  parentUserId: string,
  cartItems: {
    parentChildId: string;
    deliveryDateId: string;
    menuItemId: string;
    choice?: string | null;
    size?: string | null;
    additions: string[];
    removals: string[];
  }[],
  code?: string | null
) {
  if (!cartItems.length) {
    throw new Error("Cart is empty.");
  }

  const now = new Date();

  const deliveryDateIds = [...new Set(cartItems.map((item) => item.deliveryDateId))];
  const deliveryDates = await prisma.deliveryDate.findMany({
    where: { id: { in: deliveryDateIds } },
    include: {
      school: true,
      menuAvailability: {
        where: { isAvailable: true },
        include: { menuItem: { include: { options: true, sizes: true } } }
      }
    }
  });
  const deliveryDateById = new Map(deliveryDates.map((d) => [d.id, d]));
  const missingDeliveryDate = deliveryDateIds.find((id) => !deliveryDateById.has(id));
  if (missingDeliveryDate) {
    throw new Error("Delivery date not found.");
  }
  const closedDeliveryDate = deliveryDates.find((d) => !d.orderingOpen || d.cutoffAt <= now);
  if (closedDeliveryDate) {
    throw new Error(`Ordering has closed for ${closedDeliveryDate.school.name}.`);
  }

  // Every delivery date referenced in the cart must belong to the same
  // restaurant -- a cart spanning multiple schools at one restaurant is
  // supported; a cart somehow spanning two different restaurants is not
  // and would indicate something has gone wrong upstream.
  const schoolIds = [...new Set(deliveryDates.map((d) => d.schoolId))];
  const schools = await prisma.school.findMany({
    where: { id: { in: schoolIds } },
    select: { id: true, restaurantId: true }
  });
  const restaurantIds = new Set(schools.map((s) => s.restaurantId));
  if (restaurantIds.size !== 1) {
    throw new Error("Could not determine a single restaurant for this order.");
  }
  const restaurantId = [...restaurantIds][0];

  // Same monthly order cap as a regular checkout — see the comment in
  // createWeeklyCheckoutBatch above for why this is a soft, count-as-of-now
  // check rather than reserving capacity for every item in the cart.
  await assertOrderCapacity(restaurantId);

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

  const skippedItems: string[] = [];

  const batchItemGroups = await Promise.all(cartItems.map(async (cartItem) => {
    const child = childById.get(cartItem.parentChildId)!;
    const deliveryDate = deliveryDateById.get(cartItem.deliveryDateId)!;

    // Each item is checked against its OWN delivery date's school, not a
    // single shared one — this is what makes a genuinely multi-school
    // cart safe: a child assigned to an item can never end up attributed
    // to a school they don't actually attend, no matter which other
    // schools appear elsewhere in the same cart.
    if (child.schoolId !== deliveryDate.schoolId) {
      skippedItems.push(
        `${child.studentName} is registered at a different location than the delivery date selected for their item.`
      );
      return [];
    }

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

    const { discountId, discountCents } = await scoreItemDiscount({
      restaurantId,
      schoolId: deliveryDate.schoolId,
      deliveryDate: deliveryDate.deliveryDate,
      parentUserId,
      studentName: child.studentName,
      grade: child.grade ?? null,
      menuItemId: cartItem.menuItemId,
      category: menuItem.category ?? null,
      lineTotalCents,
      code,
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
        lineTotalCents,
        discountId,
        discountCents
      }
    ];
  }));

  const batchItems = batchItemGroups.flat();

  if (skippedItems.length) {
    throw new Error(`Checkout could not continue. ${skippedItems.join(" ")}`);
  }

  const subtotalCents = batchItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const discountCents = batchItems.reduce((sum, item) => sum + item.discountCents, 0);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  return prisma.weeklyCheckoutBatch.create({
    data: {
      parentUserId,
      restaurantId,
      subtotalCents,
      discountCents,
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

/**
 * Stripe Checkout only supports one session-level coupon, but different
 * children in a batch can independently win different discounts
 * (eligibility is scored per child in createWeeklyCheckoutBatch /
 * createAdHocCheckoutBatch above). When every item that got a discount
 * won the SAME one, use its real name on the Stripe page/receipt;
 * otherwise fall back to a generic label rather than picking one
 * arbitrarily. Shared by all three checkout-session callers (web + mobile
 * weekly-plan checkout, mobile ad-hoc cart checkout) so the same rule
 * applies everywhere.
 */
export async function computeBatchDiscountLabel(
  items: { discountId: string | null }[]
): Promise<string | undefined> {
  const distinctDiscountIds = [...new Set(items.map((item) => item.discountId).filter((id): id is string => Boolean(id)))];
  if (distinctDiscountIds.length === 0) return undefined;
  if (distinctDiscountIds.length > 1) return "Discounts";
  const discount = await prisma.discount.findUnique({
    where: { id: distinctDiscountIds[0] },
    select: { name: true },
  });
  return discount?.name;
}

export async function markWeeklyBatchPaidByCheckoutSession(
  sessionId: string,
  paymentIntentId?: string | null,
  amountTotalCents?: number | null
) {
  const redemptionsToLog: { discountName: string; amountCents: number; orderId: string; orderNumber: string }[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.weeklyCheckoutBatch.findFirst({
      where: { checkoutSessionId: sessionId },
      include: {
        parentUser: true,
        items: {
          include: {
            parentChild: true,
            school: true,
            deliveryDate: { include: { school: true } },
            discount: { select: { id: true, name: true } }
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

    const allocatedTotals = allocateActualTotal(
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
          discountCents: item.discountCents,
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

      // Same redemption-ledger pattern as lib/orders.ts's createPendingOrder:
      // one DiscountRedemption per Order, inside the same transaction so the
      // Order's discountCents and the ledger never disagree, plus bumping
      // the discount's usage counter. The discount decision itself was
      // already made per-item at batch-creation time (createAdHocCheckoutBatch
      // / createWeeklyCheckoutBatch) — this just records it now that the
      // item has become a real Order.
      if (item.discountId && item.discountCents > 0) {
        await tx.discountRedemption.create({
          data: {
            discountId: item.discountId,
            orderId: order.id,
            parentUserId: batch.parentUserId,
            amountCents: item.discountCents
          }
        });
        await tx.discount.update({
          where: { id: item.discountId },
          data: { currentRedemptions: { increment: 1 } }
        });
        if (item.discount) {
          redemptionsToLog.push({
            discountName: item.discount.name,
            amountCents: item.discountCents,
            orderId: order.id,
            orderNumber: order.orderNumber
          });
        }
      }
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

  // Best-effort activity-log entries, same as lib/orders.ts — failure here
  // doesn't roll back the already-committed orders/redemptions above.
  for (const redemption of redemptionsToLog) {
    await logActivity({
      restaurantId: result.batch.restaurantId,
      parentUserId: result.batch.parentUserId,
      entityType: "ORDER",
      entityId: redemption.orderId,
      action: "DISCOUNT_APPLIED",
      summary: `${redemption.discountName} applied to order ${redemption.orderNumber} — saved ${formatCurrency(redemption.amountCents)}`,
      metadata: {
        amountCents: redemption.amountCents
      }
    }).catch(() => {});
  }

  return result;
}
