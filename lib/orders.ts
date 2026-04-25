import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { orderFormSchema } from "@/lib/validation/order";
import type { OrderDraftInput } from "@/types/order";

export function buildPaidState(now = new Date()) {
  return {
    orderStatus: OrderStatus.PAID,
    paymentStatus: PaymentStatus.PAID,
    paidAt: now
  };
}

export function getCutoffErrorMessage(deliveryDate: Date, cutoffAt: Date, timezone: string) {
  return `Ordering closed for ${formatInTimeZone(deliveryDate, timezone, "EEEE, MMM d")} at ${formatInTimeZone(cutoffAt, timezone, "MMM d, h:mm a zzz")}.`;
}

export function assertOrderingOpen(now: Date, cutoffAt: Date, deliveryDate: Date, timezone = DEFAULT_TIMEZONE) {
  if (now > cutoffAt) {
    throw new Error(getCutoffErrorMessage(deliveryDate, cutoffAt, timezone));
  }
}

export function buildConfiguredCutoff(deliveryDateISO: string, timezone: string, cutoffHour: number, cutoffMinute: number) {
  const date = new Date(`${deliveryDateISO}T00:00:00`);
  const pacificDate = formatInTimeZone(date, timezone, "yyyy-MM-dd");
  const [year, month, day] = pacificDate.split("-").map(Number);
  const priorDay = new Date(Date.UTC(year, month - 1, day - 1, cutoffHour, cutoffMinute, 0));
  return fromZonedTime(
    `${priorDay.getUTCFullYear()}-${String(priorDay.getUTCMonth() + 1).padStart(2, "0")}-${String(priorDay.getUTCDate()).padStart(2, "0")} ${String(cutoffHour).padStart(2, "0")}:${String(cutoffMinute).padStart(2, "0")}:00`,
    timezone
  );
}

export async function getOrderFormData() {
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    include: {
      deliveryDates: {
        where: { orderingOpen: true },
        orderBy: { deliveryDate: "asc" }
      }
    },
    orderBy: { name: "asc" }
  });

  const menuItems = await prisma.menuItem.findMany({
    where: { isActive: true },
    include: {
      options: { orderBy: [{ optionType: "asc" }, { sortOrder: "asc" }] }
    },
    orderBy: { name: "asc" }
  });

  return { schools, menuItems };
}

export async function getAvailableMenuItems(deliveryDateId: string) {
  const deliveryDate = await prisma.deliveryDate.findUnique({
    where: { id: deliveryDateId },
    include: {
      menuAvailability: {
        where: { isAvailable: true },
        include: { menuItem: { include: { options: true } } }
      }
    }
  });

  return deliveryDate?.menuAvailability.map((entry) => entry.menuItem) ?? [];
}

export async function createPendingOrder(input: OrderDraftInput, checkoutSessionId?: string, parentUserId?: string) {
  const parsed = orderFormSchema.parse(input);
  const deliveryDate = await prisma.deliveryDate.findUnique({
    where: { id: parsed.deliveryDateId },
    include: { school: true, menuAvailability: { include: { menuItem: { include: { options: true } } } } }
  });

  if (!deliveryDate || deliveryDate.schoolId !== parsed.schoolId) {
    throw new Error("Invalid delivery date for selected school.");
  }

  if (!deliveryDate.orderingOpen) {
    throw new Error("Ordering is closed for this delivery date.");
  }

  assertOrderingOpen(new Date(), deliveryDate.cutoffAt, deliveryDate.deliveryDate, deliveryDate.school.timezone);

  let parentChild = null;
  if (parsed.parentChildId) {
    parentChild = await prisma.parentChild.findUnique({
      where: { id: parsed.parentChildId }
    });

    if (!parentChild || parentChild.archivedAt) {
      throw new Error("Saved child record not found.");
    }

    if (parentUserId && parentChild.parentUserId !== parentUserId) {
      throw new Error("You can only order for saved children on your account.");
    }
  }

  const normalizedItems = parsed.cartItems.map((cartItem) => {
    const menuEntry = deliveryDate.menuAvailability.find(
      (entry) => entry.menuItemId === cartItem.menuItemId && entry.isAvailable
    );

    if (!menuEntry) {
      throw new Error("One or more selected menu items are unavailable for that delivery date.");
    }

    const menuItem = menuEntry.menuItem;
    const addOnSet = new Set(
      menuItem.options.filter((option) => option.optionType === "ADD_ON").map((option) => option.name)
    );
    const removalSet = new Set(
      menuItem.options.filter((option) => option.optionType === "REMOVAL").map((option) => option.name)
    );

    if (!cartItem.additions.every((value) => addOnSet.has(value))) {
      throw new Error(`One or more add-ons are invalid for ${menuItem.name}.`);
    }
    if (!cartItem.removals.every((value) => removalSet.has(value))) {
      throw new Error(`One or more removals are invalid for ${menuItem.name}.`);
    }

    const requiredChoices = getRequiredChoicesForMenuItem(menuItem.slug);
    if (requiredChoices.length && (!cartItem.choice || !requiredChoices.includes(cartItem.choice))) {
      throw new Error(`Choose a required option for ${menuItem.name} before adding it to the cart.`);
    }

    const additionCost = menuItem.options
      .filter((option) => cartItem.additions.includes(option.name))
      .reduce((sum, option) => sum + option.priceDeltaCents, 0);
    const lineTotalCents = menuItem.basePriceCents + additionCost;

    return {
      menuItem,
      choice: cartItem.choice,
      additions: cartItem.additions,
      removals: cartItem.removals,
      lineTotalCents
    };
  });

  const totalCents = normalizedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const orderNumber = `SL-${formatInTimeZone(new Date(), deliveryDate.school.timezone, "yyyyMMdd")}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        schoolId: parsed.schoolId,
        studentName: parsed.studentName,
        grade: parsed.grade,
        teacherName: parsed.teacherName || null,
        classroom: parsed.classroom || null,
        allergyNotes: parsed.allergyNotes || null,
        dietaryNotes: parsed.dietaryNotes || null
      }
    });

    const order = await tx.order.create({
      data: {
        orderNumber,
        schoolId: parsed.schoolId,
        deliveryDateId: parsed.deliveryDateId,
        studentId: student.id,
        parentUserId: parentUserId ?? parentChild?.parentUserId ?? null,
        parentChildId: parentChild?.id ?? null,
        parentName: parsed.parentName,
        parentEmail: parsed.parentEmail,
        specialInstructions: parsed.specialInstructions || null,
        subtotalCents: totalCents,
        totalCents,
        checkoutSessionId: checkoutSessionId ?? null,
        items: {
          create: normalizedItems.map((item) => ({
            menuItemId: item.menuItem.id,
            itemNameSnapshot: item.menuItem.name,
            basePriceCents: item.menuItem.basePriceCents,
            additions: item.choice ? [item.choice, ...item.additions] : item.additions,
            removals: item.removals,
            allergyNotes: parsed.allergyNotes || null,
            dietaryNotes: parsed.dietaryNotes || null,
            specialInstructions: parsed.specialInstructions || null,
            lineTotalCents: item.lineTotalCents
          }))
        },
        payment: {
          create: {
            provider: "stripe",
            providerSessionId: checkoutSessionId ?? null,
            amountCents: totalCents,
            status: PaymentStatus.PENDING
          }
        }
      },
      include: {
        school: true,
        deliveryDate: true,
        student: true,
        items: true,
        payment: true
      }
    });

    return order;
  });
}

export async function markOrderPaidByCheckoutSession(
  sessionId: string,
  paymentIntentId?: string | null,
  amountTotalCents?: number | null
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { checkoutSessionId: sessionId },
      include: { items: true, student: true, school: true, deliveryDate: true, payment: true }
    });

    if (!order) {
      throw new Error("Order not found for checkout session.");
    }

    if (order.status === OrderStatus.PAID) {
      return order;
    }

    const paidState = buildPaidState(new Date());

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: paidState.orderStatus,
        paidAt: paidState.paidAt,
        paymentIntentId: paymentIntentId ?? order.paymentIntentId,
        totalCents: amountTotalCents ?? order.totalCents
      },
      include: { items: true, student: true, school: true, deliveryDate: true, payment: true }
    });

    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        status: paidState.paymentStatus,
        paidAt: paidState.paidAt,
        providerSessionId: sessionId,
        providerPaymentIntent: paymentIntentId ?? order.payment?.providerPaymentIntent,
        amountCents: amountTotalCents ?? order.payment?.amountCents ?? order.totalCents
      }
    });

    return updated;
  });
}

export async function listOrders(filters: {
  deliveryDateId?: string;
  schoolId?: string;
  schoolIds?: string[];
  status?: string;
  archived?: string;
}) {
  const where: Prisma.OrderWhereInput = {};

  if (filters.deliveryDateId) where.deliveryDateId = filters.deliveryDateId;
  if (filters.schoolIds?.length) {
    where.schoolId = { in: filters.schoolIds };
  } else if (filters.schoolId) {
    where.schoolId = filters.schoolId;
  }
  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status as OrderStatus;
  } else {
    where.status = { not: OrderStatus.PENDING };
  }
  if (filters.archived === "only") {
    where.archivedAt = { not: null };
  } else if (filters.archived !== "include") {
    where.archivedAt = null;
  }

  return prisma.order.findMany({
    where: {
      ...where,
      school: {
        slug: { in: [...ALLOWED_SCHOOL_SLUGS] }
      }
    },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: true,
      payment: true
    },
    orderBy: [{ deliveryDate: { deliveryDate: "asc" } }, { createdAt: "asc" }]
  });
}

export async function updateOrderBeforeCutoff(args: {
  orderId: string;
  teacherName?: string;
  classroom?: string;
  additions: string[];
  removals: string[];
  allergyNotes?: string;
  dietaryNotes?: string;
  specialInstructions?: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    include: {
      school: true,
      deliveryDate: true,
      items: {
        include: {
          menuItem: {
            include: { options: true }
          }
        }
      },
      student: true
    }
  });

  if (!order) {
    throw new Error("Order not found.");
  }

  assertOrderingOpen(new Date(), order.deliveryDate.cutoffAt, order.deliveryDate.deliveryDate, order.school.timezone);

  const item = order.items[0];
  const addOnSet = new Set(item.menuItem.options.filter((option) => option.optionType === "ADD_ON").map((option) => option.name));
  const removalSet = new Set(item.menuItem.options.filter((option) => option.optionType === "REMOVAL").map((option) => option.name));

  if (!args.additions.every((value) => addOnSet.has(value))) {
    throw new Error("One or more add-ons are invalid.");
  }

  if (!args.removals.every((value) => removalSet.has(value))) {
    throw new Error("One or more removals are invalid.");
  }

  const additionCost = item.menuItem.options
    .filter((option) => args.additions.includes(option.name))
    .reduce((sum, option) => sum + option.priceDeltaCents, 0);
  const totalCents = item.basePriceCents + additionCost;

  return prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: order.studentId },
      data: {
        teacherName: args.teacherName || null,
        classroom: args.classroom || null,
        allergyNotes: args.allergyNotes || null,
        dietaryNotes: args.dietaryNotes || null
      }
    });

    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        additions: args.additions,
        removals: args.removals,
        allergyNotes: args.allergyNotes || null,
        dietaryNotes: args.dietaryNotes || null,
        specialInstructions: args.specialInstructions || null,
        lineTotalCents: totalCents
      }
    });

    return tx.order.update({
      where: { id: order.id },
      data: {
        subtotalCents: totalCents,
        totalCents,
        specialInstructions: args.specialInstructions || null,
        payment: {
          update: {
            amountCents: totalCents
          }
        }
      },
      include: {
        school: true,
        deliveryDate: true,
        student: true,
        items: true
      }
    });
  });
}
