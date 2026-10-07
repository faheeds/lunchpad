import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { orderFormSchema } from "@/lib/validation/order";
import type { OrderDraftInput } from "@/types/order";
import { stripe } from "@/lib/payments/stripe";
import { logActivity } from "@/lib/activity";
import { formatCurrency } from "@/lib/utils";
import { pickApplicableDiscounts, type CartLine } from "@/lib/discounts";
import { parseWeeklyTiers, planMultiDayReprice, weekWindow, type RepriceAdjustment } from "@/lib/volume-discount";
import { resolveLineItemPrice } from "@/lib/pricing";
import { createOrderEditCheckoutSession } from "@/lib/payments/checkout";
import { checkLimit, PlanLimitError } from "@/lib/plans";

/**
 * Count of PAID orders for a restaurant so far this calendar month — the
 * basis for the plan's monthly order cap. Only PAID counts; a PENDING
 * checkout that never completes shouldn't count against the limit.
 */
export async function getPaidOrdersThisMonth(restaurantId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return prisma.order.count({
    where: { restaurantId, status: OrderStatus.PAID, createdAt: { gte: monthStart } },
  });
}

/**
 * Throws a customer-facing error if the restaurant has hit its monthly
 * order cap. Call before starting a checkout (pending order or batch),
 * never after payment succeeds — we can't un-charge a customer just
 * because the restaurant is over its plan limit.
 */
export async function assertOrderCapacity(restaurantId: string): Promise<void> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { plan: true },
  });
  if (!restaurant) return;
  const current = await getPaidOrdersThisMonth(restaurantId);
  try {
    checkLimit(restaurant.plan, "ordersThisMonth", current);
  } catch (e) {
    if (e instanceof PlanLimitError) {
      throw new Error("This restaurant isn't accepting new orders right now — please check back soon or contact them directly.");
    }
    throw e;
  }
}

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

export async function getOrderFormData(restaurantId: string) {
  const schools = await prisma.school.findMany({
    where: { restaurantId, isActive: true },
    include: {
      deliveryDates: {
        where: { orderingOpen: true },
        orderBy: { deliveryDate: "asc" }
      }
    },
    orderBy: { name: "asc" }
  });

  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId, isActive: true },
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
    include: {
      school: true,
      menuAvailability: {
        include: {
          menuItem: {
            include: {
              options: true,
              sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
            },
          },
        },
      },
    },
  });

  if (!deliveryDate || deliveryDate.schoolId !== parsed.schoolId) {
    throw new Error("Invalid delivery date for selected school.");
  }

  if (!deliveryDate.orderingOpen) {
    throw new Error("Ordering is closed for this delivery date.");
  }

  assertOrderingOpen(new Date(), deliveryDate.cutoffAt, deliveryDate.deliveryDate, deliveryDate.school.timezone);

  await assertOrderCapacity(deliveryDate.school.restaurantId);

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

  // Quantity cap check — must be done before the synchronous .map() below
  for (const cartItem of parsed.cartItems) {
    const menuEntry = deliveryDate.menuAvailability.find(
      (entry) => entry.menuItemId === cartItem.menuItemId && entry.isAvailable
    );
    if (menuEntry && menuEntry.maxQuantity !== null && menuEntry.maxQuantity !== undefined) {
      const soldCount = await prisma.orderItem.count({
        where: {
          menuItemId: cartItem.menuItemId,
          order: {
            deliveryDateId: parsed.deliveryDateId,
            status: OrderStatus.PAID,
            archivedAt: null,
          },
        },
      });
      if (soldCount >= menuEntry.maxQuantity) {
        throw new Error(`Sorry, ${menuEntry.menuItem.name} is sold out for this delivery date.`);
      }
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

    const requiredChoices = getRequiredChoicesForMenuItem(menuItem);
    if (requiredChoices.length && (!cartItem.choice || !requiredChoices.includes(cartItem.choice))) {
      throw new Error(`Choose a required option for ${menuItem.name} before adding it to the cart.`);
    }

    // Resolve per-unit base price. Items with sizes use the picked
    // size's absolute price; items without sizes use the legacy single
    // basePriceCents on MenuItem. Validation rejects a missing size on
    // a sized item so kitchen never sees ambiguous orders.
    let lineBasePriceCents: number;
    let sizeNameSnapshot: string | null = null;
    if (menuItem.sizes.length > 0) {
      if (!cartItem.size) {
        throw new Error(`Choose a size for ${menuItem.name} before adding it to the cart.`);
      }
      const size = menuItem.sizes.find((s) => s.name === cartItem.size);
      if (!size) {
        throw new Error(`"${cartItem.size}" is not a valid size for ${menuItem.name}.`);
      }
      lineBasePriceCents = size.priceCents;
      sizeNameSnapshot = size.name;
    } else {
      // No sizes defined → legacy single-price item. We still tolerate
      // a stray `size` from the client (e.g. cached UI state) by ignoring
      // it; otherwise we'd break customers who hit the form mid-deploy.
      lineBasePriceCents = menuItem.basePriceCents;
    }

    const lineTotalCents = resolveLineItemPrice({
      basePriceCents: lineBasePriceCents,
      additions: menuItem.options.filter((option) => cartItem.additions.includes(option.name)),
    });

    return {
      menuItem,
      choice: cartItem.choice,
      sizeName: sizeNameSnapshot,
      basePriceCents: lineBasePriceCents,
      additions: cartItem.additions,
      removals: cartItem.removals,
      lineTotalCents
    };
  });

  const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const orderNumber = `SL-${formatInTimeZone(new Date(), deliveryDate.school.timezone, "yyyyMMdd")}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  // ── Discount evaluation ─────────────────────────────────────────────────
  // Run the discount engine BEFORE the transaction so we have a stable
  // snapshot of what to apply. Re-evaluating inside the transaction would
  // introduce phantom-read complexity (counter increments are write-write
  // serialized anyway, so a race past the cap is harmless and rare). The
  // engine returns whichever single auto-discount won + whichever promo
  // code matched, applying stacking rules.
  const cartLines: CartLine[] = normalizedItems.map((item) => ({
    menuItemId: item.menuItem.id,
    category: item.menuItem.category,
    lineTotalCents: item.lineTotalCents,
  }));
  const discountResult = await pickApplicableDiscounts({
    cart: {
      restaurantId: deliveryDate.school.restaurantId,
      schoolId: parsed.schoolId,
      deliveryDate: deliveryDate.deliveryDate,
      parentUserId: parentUserId ?? parentChild?.parentUserId ?? null,
      // Lets multi-day tiers recognise this family's earlier paid days
      // even when they checked out as a guest on a previous day.
      parentEmail: parsed.parentEmail,
      lines: cartLines,
    },
    code: parsed.discountCode,
  });
  const discountCentsApplied = discountResult.totalDiscountCents;
  const totalCents = Math.max(0, subtotalCents - discountCentsApplied);

  return prisma.$transaction(async (tx) => {
    // Reject SCHOOL orders that arrive with no grade — the form normally
    // enforces this, but the validation schema is permissive so OFFICE
    // orders pass through. For OFFICE, fall back to "—" so the non-null
    // DB column stays clean without forcing a meaningless field on the form.
    if (deliveryDate.school.locationType === "SCHOOL" && !parsed.grade) {
      throw new Error("Grade is required for school orders.");
    }
    const gradeValue = parsed.grade || (deliveryDate.school.locationType === "OFFICE" ? "—" : "");

    const student = await tx.student.create({
      data: {
        schoolId: parsed.schoolId,
        studentName: parsed.studentName,
        grade: gradeValue,
        teacherName: parsed.teacherName || null,
        classroom: parsed.classroom || null,
        allergyNotes: parsed.allergyNotes || null,
        dietaryNotes: parsed.dietaryNotes || null
      }
    });

    const order = await tx.order.create({
      data: {
        orderNumber,
        restaurantId: deliveryDate.school.restaurantId,
        schoolId: parsed.schoolId,
        deliveryDateId: parsed.deliveryDateId,
        studentId: student.id,
        parentUserId: parentUserId ?? parentChild?.parentUserId ?? null,
        parentChildId: parentChild?.id ?? null,
        parentName: parsed.parentName,
        parentEmail: parsed.parentEmail,
        specialInstructions: parsed.specialInstructions || null,
        subtotalCents,
        discountCents: discountCentsApplied,
        totalCents,
        checkoutSessionId: checkoutSessionId ?? null,
        items: {
          create: normalizedItems.map((item) => ({
            menuItemId: item.menuItem.id,
            itemNameSnapshot: item.menuItem.name,
            // Resolved per-unit price — already accounts for size selection.
            basePriceCents: item.basePriceCents,
            sizeName: item.sizeName,
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

    // Persist redemption rows + bump counters for each discount that
    // actually applied. Inside the same transaction so the order's
    // discountCents and the redemption ledger never disagree. If the
    // transaction rolls back later (e.g. Stripe error), redemption
    // disappears with the order.
    //
    // Schema currently enforces one redemption per order via @@unique on
    // orderId — for v1 we get either an auto OR a code OR nothing,
    // never both. The engine's stacking rule (code overrides auto unless
    // explicitly stackable) makes this safe; we'll relax the @@unique
    // when we ship loyalty-with-promo-stacking later.
    const winning = discountResult.code ?? discountResult.auto;
    if (winning) {
      await tx.discountRedemption.create({
        data: {
          discountId: winning.discount.id,
          orderId: order.id,
          parentUserId: parentUserId ?? parentChild?.parentUserId ?? null,
          amountCents: winning.amountCents,
        },
      });
      await tx.discount.update({
        where: { id: winning.discount.id },
        data: { currentRedemptions: { increment: 1 } },
      });
    }

    return order;
  }).then(async (order) => {
    // Best-effort activity-log entry — discount attribution stays in the
    // timeline even if it predates the order being marked PAID. Failure
    // here doesn't roll back the order (audit is a should, not a must).
    const winning = discountResult.code ?? discountResult.auto;
    if (winning) {
      await logActivity({
        restaurantId: order.restaurantId,
        parentUserId: parentUserId ?? parentChild?.parentUserId ?? null,
        entityType: "ORDER",
        entityId: order.id,
        action: "DISCOUNT_APPLIED",
        summary: `${winning.discount.name} applied to order ${order.orderNumber} — saved ${formatCurrency(winning.amountCents)}`,
        metadata: {
          discountId: winning.discount.id,
          amountCents: winning.amountCents,
          viaCode: Boolean(discountResult.code),
        },
      });
    }
    return order;
  });
}

// ─── Admin manual order creation ─────────────────────────────────────────────

/**
 * Payment mode for an admin-created order.
 *
 *   stripe_link  — generate a Stripe Checkout URL the admin can share with
 *                  the parent. Order is PENDING until the parent pays.
 *   manual       — admin records an off-platform payment (cash, check, etc.).
 *                  Order is PAID immediately. Funds are not collected by
 *                  Stripe; the operator handles their own books.
 *   comped       — free order. totalCents is preserved on the line items
 *                  (so the kitchen sheet still shows real items) but
 *                  Order.compedAt is stamped and Payment.amountCents is 0.
 */
export type AdminOrderPaymentMode =
  | { kind: "stripe_link" }
  | { kind: "manual"; method: string; reference?: string; notes?: string }
  | { kind: "comped"; reason?: string };

/**
 * Create an order on behalf of a customer. Used by the admin "+ New order"
 * flow. Reuses the same validation + cap-checking logic as createPendingOrder
 * so the kitchen sheet, reports, and emails treat the resulting order
 * identically to a self-service one.
 *
 * Returns the created order with its items + payment relation populated so
 * the caller can immediately render a confirmation. For Stripe-link mode,
 * the caller is responsible for generating the Checkout URL afterwards
 * (we don't import Stripe here to keep this helper testable).
 */
export async function createAdminOrder(args: {
  input: OrderDraftInput;
  paymentMode: AdminOrderPaymentMode;
  /** Restaurant the admin belongs to — enforced against the delivery date. */
  restaurantId: string;
  /** Admin who's creating the order. Stored on Order.createdByAdminId for
   *  audit. */
  adminUserId: string;
}) {
  const parsed = orderFormSchema.parse(args.input);

  const deliveryDate = await prisma.deliveryDate.findUnique({
    where: { id: parsed.deliveryDateId },
    include: {
      school: true,
      menuAvailability: {
        include: {
          menuItem: {
            include: {
              options: true,
              sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
            },
          },
        },
      },
    },
  });
  if (!deliveryDate || deliveryDate.schoolId !== parsed.schoolId) {
    throw new Error("Invalid delivery date for selected location.");
  }
  // Admins are allowed to create orders past the customer cutoff (they
  // sometimes need to add a late add-on for a kitchen they're already
  // packing) — but the delivery date itself must belong to the same
  // tenant or we'd be writing across tenants.
  if (deliveryDate.school.restaurantId !== args.restaurantId) {
    throw new Error("Delivery date belongs to a different restaurant.");
  }

  // Same monthly order cap as the customer checkout flow — an admin
  // shouldn't be able to bypass it via manual/comped orders. Unlike the
  // customer flow, surface the real plan-limit message here since it's
  // actionable for the admin (upgrade the plan).
  {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: args.restaurantId },
      select: { plan: true },
    });
    if (restaurant) {
      const current = await getPaidOrdersThisMonth(args.restaurantId);
      checkLimit(restaurant.plan, "ordersThisMonth", current);
    }
  }

  // SCHOOL location requires grade just like the customer flow; OFFICE
  // falls through with the "—" placeholder set inside the transaction.
  if (deliveryDate.school.locationType === "SCHOOL" && !parsed.grade) {
    throw new Error("Grade is required for school orders.");
  }
  const gradeValue = parsed.grade || (deliveryDate.school.locationType === "OFFICE" ? "—" : "");

  // Cap-check: if a menu item has maxQuantity, refuse to over-sell. Admins
  // can still override by raising the cap on the delivery date itself.
  for (const cartItem of parsed.cartItems) {
    const menuEntry = deliveryDate.menuAvailability.find(
      (entry) => entry.menuItemId === cartItem.menuItemId && entry.isAvailable
    );
    if (menuEntry && menuEntry.maxQuantity !== null && menuEntry.maxQuantity !== undefined) {
      const soldCount = await prisma.orderItem.count({
        where: {
          menuItemId: cartItem.menuItemId,
          order: {
            deliveryDateId: parsed.deliveryDateId,
            status: OrderStatus.PAID,
            archivedAt: null,
          },
        },
      });
      if (soldCount >= menuEntry.maxQuantity) {
        throw new Error(`${menuEntry.menuItem.name} is sold out for this delivery date.`);
      }
    }
  }

  const normalizedItems = parsed.cartItems.map((cartItem) => {
    const menuEntry = deliveryDate.menuAvailability.find(
      (entry) => entry.menuItemId === cartItem.menuItemId && entry.isAvailable
    );
    if (!menuEntry) throw new Error("One or more menu items aren't available for this delivery date.");

    const menuItem = menuEntry.menuItem;
    const requiredChoices = getRequiredChoicesForMenuItem(menuItem);
    if (requiredChoices.length && (!cartItem.choice || !requiredChoices.includes(cartItem.choice))) {
      throw new Error(`Choose a required option for ${menuItem.name} before adding it.`);
    }

    // Mirror the customer-side size resolution from createPendingOrder so
    // an admin creating a manual order can't bypass the size requirement
    // and end up with a $0 / NaN price on a sized item.
    let lineBasePriceCents: number;
    let sizeNameSnapshot: string | null = null;
    if (menuItem.sizes.length > 0) {
      if (!cartItem.size) {
        throw new Error(`Choose a size for ${menuItem.name} before adding it.`);
      }
      const size = menuItem.sizes.find((s) => s.name === cartItem.size);
      if (!size) {
        throw new Error(`"${cartItem.size}" is not a valid size for ${menuItem.name}.`);
      }
      lineBasePriceCents = size.priceCents;
      sizeNameSnapshot = size.name;
    } else {
      lineBasePriceCents = menuItem.basePriceCents;
    }

    const lineTotalCents = resolveLineItemPrice({
      basePriceCents: lineBasePriceCents,
      additions: menuItem.options.filter((option) => cartItem.additions.includes(option.name)),
    });

    return {
      menuItem,
      choice: cartItem.choice,
      sizeName: sizeNameSnapshot,
      basePriceCents: lineBasePriceCents,
      additions: cartItem.additions,
      removals: cartItem.removals,
      lineTotalCents,
    };
  });

  const totalCents = normalizedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const orderNumber = `SL-${formatInTimeZone(new Date(), deliveryDate.school.timezone, "yyyyMMdd")}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  // Decide order/payment status from the payment mode. We resolve all
  // status fields up front so the transaction below stays linear.
  let orderStatus: OrderStatus = OrderStatus.PENDING;
  let paidAt: Date | null = null;
  let paymentStatus: PaymentStatus = PaymentStatus.PENDING;
  let paymentProvider: string = "stripe";
  let paymentAmountCents: number = totalCents;
  let paymentMethod: string | null = null;
  let paymentNotes: string | null = null;
  let compedAt: Date | null = null;
  let compedReason: string | null = null;

  switch (args.paymentMode.kind) {
    case "stripe_link":
      paymentProvider = "stripe_checkout_link";
      // Stays PENDING until the parent pays via the link. The Stripe
      // webhook will mark it PAID just like a regular checkout order.
      break;
    case "manual":
      orderStatus = OrderStatus.PAID;
      paidAt = new Date();
      paymentStatus = PaymentStatus.PAID;
      paymentProvider = "manual";
      paymentMethod = args.paymentMode.method;
      paymentNotes =
        [args.paymentMode.reference, args.paymentMode.notes].filter(Boolean).join(" — ") || null;
      break;
    case "comped":
      orderStatus = OrderStatus.PAID;
      paidAt = new Date();
      paymentStatus = PaymentStatus.PAID;
      paymentProvider = "comped";
      paymentAmountCents = 0;
      paymentMethod = "free";
      paymentNotes = args.paymentMode.reason ?? null;
      compedAt = new Date();
      compedReason = args.paymentMode.reason ?? null;
      break;
  }

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        schoolId: parsed.schoolId,
        studentName: parsed.studentName,
        grade: gradeValue,
        teacherName: parsed.teacherName || null,
        classroom: parsed.classroom || null,
        allergyNotes: parsed.allergyNotes || null,
        dietaryNotes: parsed.dietaryNotes || null,
      },
    });

    const order = await tx.order.create({
      data: {
        orderNumber,
        restaurantId: deliveryDate.school.restaurantId,
        schoolId: parsed.schoolId,
        deliveryDateId: parsed.deliveryDateId,
        studentId: student.id,
        parentName: parsed.parentName,
        parentEmail: parsed.parentEmail,
        specialInstructions: parsed.specialInstructions || null,
        subtotalCents: totalCents,
        totalCents,
        status: orderStatus,
        paidAt,
        compedAt,
        compedReason,
        createdByAdminId: args.adminUserId,
        items: {
          create: normalizedItems.map((item) => ({
            menuItemId: item.menuItem.id,
            itemNameSnapshot: item.menuItem.name,
            basePriceCents: item.basePriceCents,
            sizeName: item.sizeName,
            additions: item.choice ? [item.choice, ...item.additions] : item.additions,
            removals: item.removals,
            allergyNotes: parsed.allergyNotes || null,
            dietaryNotes: parsed.dietaryNotes || null,
            specialInstructions: parsed.specialInstructions || null,
            lineTotalCents: item.lineTotalCents,
          })),
        },
        payment: {
          create: {
            provider: paymentProvider,
            amountCents: paymentAmountCents,
            status: paymentStatus,
            paidAt,
            method: paymentMethod,
            notes: paymentNotes,
          },
        },
      },
      include: {
        school: true,
        deliveryDate: true,
        student: true,
        items: true,
        payment: true,
      },
    });

    return order;
  }).then(async (order) => {
    // Activity log — outside the transaction so a logging blip never rolls
    // back the order. The action varies by payment mode so the change-log
    // reads naturally to operators ("created & comped" vs "created via
    // checkout link").
    let action: "CREATED" | "COMPED" | "PAID" = "CREATED";
    let summary = `Admin created order ${order.orderNumber} for ${order.student.studentName} — ${formatCurrency(order.totalCents)}`;
    if (args.paymentMode.kind === "comped") {
      action = "COMPED";
      summary = `Admin comped order ${order.orderNumber} for ${order.student.studentName} (${formatCurrency(order.totalCents)} value)${
        args.paymentMode.reason ? ` — ${args.paymentMode.reason}` : ""
      }`;
    } else if (args.paymentMode.kind === "manual") {
      action = "PAID";
      summary = `Admin recorded ${args.paymentMode.method} payment for order ${order.orderNumber} — ${formatCurrency(order.totalCents)}`;
    } else {
      summary = `Admin created order ${order.orderNumber} (Stripe link mode) — ${formatCurrency(order.totalCents)} pending`;
    }
    await logActivity({
      restaurantId: args.restaurantId,
      adminUserId: args.adminUserId,
      entityType: "ORDER",
      entityId: order.id,
      action,
      summary,
      metadata: {
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
        paymentMode: args.paymentMode.kind,
        ...(args.paymentMode.kind === "manual"
          ? { method: args.paymentMode.method, reference: args.paymentMode.reference ?? null }
          : {}),
        ...(args.paymentMode.kind === "comped" ? { reason: args.paymentMode.reason ?? null } : {}),
      },
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
  }).then(async (updated) => {
    // Log paid status outside the transaction. Triggered by Stripe webhook —
    // no admin/parent context, so this lands as a system event.
    await logActivity({
      restaurantId: updated.restaurantId,
      entityType: "ORDER",
      entityId: updated.id,
      action: "PAID",
      summary: `Order ${updated.orderNumber} paid — ${formatCurrency(updated.totalCents)} via Stripe`,
      metadata: { orderNumber: updated.orderNumber, totalCents: updated.totalCents },
    });
    return updated;
  });
}

export async function listOrders(filters: {
  /** REQUIRED — multi-tenant scoping. Pass restaurant.id from requireRestaurant(). */
  restaurantId: string;
  deliveryDateId?: string;
  schoolId?: string;
  schoolIds?: string[];
  /** Exact match against Student.grade -- the same free-text values as
   *  School.grades (e.g. "5th Grade"). Pass an array to match ANY of the
   *  given grades (multi-select filter). */
  grade?: string | string[];
  status?: string;
  archived?: string;
  /** Free-text search across student name, parent name, parent email, order
   *  number, school name, and the snapshot name of any item on the order.
   *  Empty/whitespace-only strings are ignored. */
  search?: string;
  /** "yyyy-MM-dd" (inclusive). Filters by deliveryDate.deliveryDate.
   *  Both ends optional — open-ended ranges are supported. */
  fromDate?: string;
  toDate?: string;
  /** Sort key. Defaults to "delivery-asc" (matches the kitchen workflow:
   *  earliest upcoming delivery first). */
  sort?: "delivery-asc" | "delivery-desc" | "created-desc" | "amount-desc" | "amount-asc";
}) {
  const where: Prisma.OrderWhereInput = { restaurantId: filters.restaurantId };

  if (filters.deliveryDateId) {
    const anchor = await prisma.deliveryDate.findUnique({
      where: { id: filters.deliveryDateId },
      select: { deliveryDate: true, school: { select: { timezone: true } } },
    });
    if (anchor) {
      const anchorDay = formatInTimeZone(anchor.deliveryDate, anchor.school.timezone, "yyyy-MM-dd");
      const windowStart = new Date(anchor.deliveryDate.getTime() - 2 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(anchor.deliveryDate.getTime() + 2 * 24 * 60 * 60 * 1000);
      const candidates = await prisma.deliveryDate.findMany({
        where: {
          school: { restaurantId: filters.restaurantId },
          deliveryDate: { gte: windowStart, lte: windowEnd },
        },
        select: { id: true, deliveryDate: true, school: { select: { timezone: true } } },
      });
      const matchingIds = candidates
        .filter((c) => formatInTimeZone(c.deliveryDate, c.school.timezone, "yyyy-MM-dd") === anchorDay)
        .map((c) => c.id);
      where.deliveryDateId = { in: matchingIds.length ? matchingIds : [filters.deliveryDateId] };
    } else {
      where.deliveryDateId = filters.deliveryDateId;
    }
  }
  if (filters.schoolIds?.length) {
    where.schoolId = { in: filters.schoolIds };
  } else if (filters.schoolId) {
    where.schoolId = filters.schoolId;
  }
  const grades = filters.grade
    ? (Array.isArray(filters.grade) ? filters.grade : [filters.grade]).filter(Boolean)
    : [];
  if (grades.length) {
    where.student = { grade: { in: grades } };
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

  // Date range filter — applied against the linked DeliveryDate.deliveryDate
  // (the calendar day the lunch is for, not when the order was placed).
  // Operators care about "show me everything for next week" not "show me
  // orders placed last week".
  const dateRange: { gte?: Date; lte?: Date } = {};
  if (filters.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.fromDate)) {
    dateRange.gte = new Date(`${filters.fromDate}T00:00:00.000Z`);
  }
  if (filters.toDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.toDate)) {
    // End-of-day inclusive — pick the moment just before the next day starts
    // so an order with deliveryDate 2026-05-09T17:00 still matches when
    // toDate=2026-05-09.
    dateRange.lte = new Date(`${filters.toDate}T23:59:59.999Z`);
  }
  if (dateRange.gte || dateRange.lte) {
    where.deliveryDate = { deliveryDate: dateRange };
  }

  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { parentName: { contains: q, mode: "insensitive" } },
      { parentEmail: { contains: q, mode: "insensitive" } },
      { student: { studentName: { contains: q, mode: "insensitive" } } },
      { school: { name: { contains: q, mode: "insensitive" } } },
      { items: { some: { itemNameSnapshot: { contains: q, mode: "insensitive" } } } },
    ];
  }

  // Sort options — operators use different defaults depending on what
  // they're doing. Kitchen prep wants delivery-asc (earliest upcoming
  // first). Refund triage wants created-desc (newest first). Reports want
  // amount-desc.
  let orderBy: Prisma.OrderOrderByWithRelationInput[];
  switch (filters.sort) {
    case "delivery-desc":
      orderBy = [{ deliveryDate: { deliveryDate: "desc" } }, { createdAt: "desc" }];
      break;
    case "created-desc":
      orderBy = [{ createdAt: "desc" }];
      break;
    case "amount-desc":
      orderBy = [{ totalCents: "desc" }, { createdAt: "desc" }];
      break;
    case "amount-asc":
      orderBy = [{ totalCents: "asc" }, { createdAt: "desc" }];
      break;
    case "delivery-asc":
    default:
      orderBy = [{ deliveryDate: { deliveryDate: "asc" } }, { createdAt: "asc" }];
  }

  return prisma.order.findMany({
    where: {
      ...where,
      school: {
        isActive: true
      }
    },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: true,
      payment: true
    },
    orderBy,
  });
}

export type OrderUpdateResult =
  | { action: "updated"; order: { id: string; orderNumber: string; restaurantId: string } }
  | { action: "checkout_required"; checkoutUrl: string };

export async function updateOrderBeforeCutoff(args: {
  orderId: string;
  /** REQUIRED — verifies the order belongs to the calling parent. */
  parentUserId: string;
  teacherName?: string;
  classroom?: string;
  additions: string[];
  removals: string[];
  allergyNotes?: string;
  dietaryNotes?: string;
  specialInstructions?: string;
}): Promise<OrderUpdateResult> {
  // Tenant-scoped: only the order's owning parent can modify it.
  const order = await prisma.order.findFirst({
    where: { id: args.orderId, parentUserId: args.parentUserId },
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
      student: true,
      payment: true,
      restaurant: { select: { stripeAccountId: true } },
    }
  });

  if (!order) {
    throw new Error("Order not found.");
  }

  if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PARTIALLY_REFUNDED) {
    throw new Error("Only paid orders can be modified.");
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

  const newTotalCents = resolveLineItemPrice({
    basePriceCents: item.basePriceCents,
    additions: item.menuItem.options.filter((option) => args.additions.includes(option.name)),
  });

  const deltaCents = newTotalCents - order.totalCents;

  // ── Case B: increase — customer must pay the delta via a new Checkout session ──
  if (deltaCents > 0) {
    const now = new Date();
    const cutoffAt = order.deliveryDate.cutoffAt;
    const msUntilCutoff = cutoffAt.getTime() - now.getTime();

    if (msUntilCutoff < 30 * 60 * 1000) {
      throw new Error("Too close to cutoff — contact the restaurant to make this change.");
    }

    if (order.pendingEditCheckoutSession) {
      throw new Error("You already have a pending edit in progress. Complete or wait for it to expire before submitting another.");
    }

    if (order.deltaPaymentIntentId) {
      throw new Error("This order has already been increased once and cannot be increased again.");
    }

    const twentyFourHoursFromNow = now.getTime() + 24 * 60 * 60 * 1000 - 60_000;
    const expiresAt = Math.floor(Math.min(cutoffAt.getTime(), twentyFourHoursFromNow) / 1000);

    const newItemsJson = JSON.stringify({
      additions: args.additions,
      removals: args.removals,
      allergyNotes: args.allergyNotes ?? null,
      dietaryNotes: args.dietaryNotes ?? null,
      specialInstructions: args.specialInstructions ?? null,
      lineTotalCents: newTotalCents,
    });

    const session = await createOrderEditCheckoutSession({
      orderId: order.id,
      orderNumber: order.orderNumber,
      parentEmail: order.parentEmail,
      deltaCents,
      newTotalCents,
      newItemsJson,
      stripeAccountId: order.restaurant.stripeAccountId,
      expiresAt,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        pendingEditTotalCents: newTotalCents,
        pendingEditCheckoutSession: session.id,
        pendingEditCreatedAt: now,
      },
    });

    return { action: "checkout_required", checkoutUrl: session.url! };
  }

  // ── Case A: decrease — issue partial Stripe refund first, then update DB ──
  if (deltaCents < 0) {
    const refundCents = -deltaCents; // positive amount to refund
    const paymentIntentId = order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;

    if (!paymentIntentId) {
      throw new Error("Cannot issue refund: no Stripe payment intent found for this order. Contact support.");
    }
    if (stripe) {
      await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: refundCents,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            editDecrease: "true",
            newTotalCents: String(newTotalCents),
          },
        },
        { idempotencyKey: `edit-decrease-${order.id}-${newTotalCents}` }
      );
    }

    // DB writes sequentially after Stripe succeeds.
    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        additions: args.additions,
        removals: args.removals,
        allergyNotes: args.allergyNotes || null,
        dietaryNotes: args.dietaryNotes || null,
        specialInstructions: args.specialInstructions || null,
        lineTotalCents: newTotalCents,
      },
    });

    await prisma.student.update({
      where: { id: order.studentId },
      data: {
        teacherName: args.teacherName || null,
        classroom: args.classroom || null,
        allergyNotes: args.allergyNotes || null,
        dietaryNotes: args.dietaryNotes || null,
      },
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        subtotalCents: newTotalCents,
        totalCents: newTotalCents,
        specialInstructions: args.specialInstructions || null,
        payment: { update: { amountCents: newTotalCents } },
      },
      select: { id: true, orderNumber: true, restaurantId: true },
    });

    await logActivity({
      restaurantId: updated.restaurantId,
      parentUserId: args.parentUserId,
      entityType: "ORDER",
      entityId: updated.id,
      action: "MODIFIED",
      summary: `Customer modified order ${updated.orderNumber} — total adjusted to ${formatCurrency(newTotalCents)} (${formatCurrency(refundCents)} refunded)`,
      metadata: {
        orderNumber: updated.orderNumber,
        newTotalCents,
        refundCents,
        additions: args.additions,
        removals: args.removals,
      },
    });

    return { action: "updated", order: updated };
  }

  // ── Case equal: no price change — update items/notes only ──
  await prisma.student.update({
    where: { id: order.studentId },
    data: {
      teacherName: args.teacherName || null,
      classroom: args.classroom || null,
      allergyNotes: args.allergyNotes || null,
      dietaryNotes: args.dietaryNotes || null,
    },
  });

  await prisma.orderItem.update({
    where: { id: item.id },
    data: {
      additions: args.additions,
      removals: args.removals,
      allergyNotes: args.allergyNotes || null,
      dietaryNotes: args.dietaryNotes || null,
      specialInstructions: args.specialInstructions || null,
      lineTotalCents: newTotalCents,
    },
  });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      specialInstructions: args.specialInstructions || null,
    },
    select: { id: true, orderNumber: true, restaurantId: true },
  });

  await logActivity({
    restaurantId: updated.restaurantId,
    parentUserId: args.parentUserId,
    entityType: "ORDER",
    entityId: updated.id,
    action: "MODIFIED",
    summary: `Customer modified order ${updated.orderNumber} — total unchanged at ${formatCurrency(newTotalCents)}`,
    metadata: {
      orderNumber: updated.orderNumber,
      totalCents: newTotalCents,
      additions: args.additions,
      removals: args.removals,
    },
  });

  return { action: "updated", order: updated };
}

export type AdminAdjustmentMode =
  | { kind: "stripe_link" }
  | { kind: "manual"; method: string; reference?: string; notes?: string }
  | { kind: "comped"; reason?: string };

/**
 * Admin-only order update — bypasses the cutoff check.
 * Handles price decreases (Stripe refund), increases (stripe_link / manual / comped),
 * and metadata-only edits (same price).
 *
 * `adjustmentMode` controls how a price increase is handled:
 *   stripe_link — generate a delta Checkout URL the admin shares with the parent
 *   manual      — record an off-Stripe payment, apply immediately
 *   comped      — admin waives the extra cost, apply immediately (default)
 *
 * Defaults to { kind: "comped" } for backwards compatibility with callers
 * that do not pass adjustmentMode (admin edit form — price rarely changes).
 */
export async function updateOrderAsAdmin(args: {
  orderId: string;
  /** REQUIRED — multi-tenant scoping. The admin's restaurantId. */
  restaurantId: string;
  /** Admin user performing the edit. Optional so legacy callers don't
   *  break, but caller should pass it whenever available so the
   *  activity timeline can attribute the change. */
  adminUserId?: string;
  teacherName?: string;
  classroom?: string;
  additions: string[];
  removals: string[];
  allergyNotes?: string;
  dietaryNotes?: string;
  specialInstructions?: string;
  adminNote?: string;
  adjustmentMode?: AdminAdjustmentMode;
}): Promise<OrderUpdateResult> {
  const adjustmentMode: AdminAdjustmentMode = args.adjustmentMode ?? { kind: "comped" };

  // Tenant-scoped: order must belong to the admin's restaurant.
  const order = await prisma.order.findFirst({
    where: { id: args.orderId, restaurantId: args.restaurantId },
    include: {
      school: true,
      deliveryDate: true,
      items: { include: { menuItem: { include: { options: true } } } },
      student: true,
      payment: true,
      restaurant: { select: { stripeAccountId: true } },
    },
  });

  if (!order) throw new Error("Order not found.");

  const item = order.items[0];
  const addOnSet = new Set(
    item.menuItem.options.filter((o) => o.optionType === "ADD_ON").map((o) => o.name)
  );
  const removalSet = new Set(
    item.menuItem.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name)
  );

  if (!args.additions.every((v) => addOnSet.has(v))) throw new Error("One or more add-ons are invalid.");
  if (!args.removals.every((v) => removalSet.has(v))) throw new Error("One or more removals are invalid.");

  const newTotalCents = resolveLineItemPrice({
    basePriceCents: item.basePriceCents,
    additions: item.menuItem.options.filter((o) => args.additions.includes(o.name)),
  });

  const deltaCents = newTotalCents - order.totalCents;

  const specialInstructions = args.adminNote
    ? `[Admin note: ${args.adminNote}]${args.specialInstructions ? `\n${args.specialInstructions}` : ""}`
    : (args.specialInstructions ?? order.specialInstructions ?? null);

  // ── Case A: decrease — Stripe refund first, DB update after ──
  if (deltaCents < 0) {
    const refundCents = -deltaCents;
    const paymentIntentId = order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;

    const isStripePayment = order.payment?.provider === "stripe" || order.payment?.provider === "stripe_checkout_link";
    if (isStripePayment) {
      if (!paymentIntentId) {
        throw new Error("Cannot issue refund: Stripe order is missing a payment intent. Contact support.");
      }
      if (stripe) {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            amount: refundCents,
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              editDecrease: "true",
              newTotalCents: String(newTotalCents),
              adminUserId: args.adminUserId ?? "unknown",
            },
          },
          { idempotencyKey: `edit-decrease-${order.id}-${newTotalCents}` }
        );
      }
    }
    // Non-Stripe orders (manual/comped): no refund call — admin absorbed the cost.

    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        additions: args.additions,
        removals: args.removals,
        allergyNotes: args.allergyNotes ?? null,
        dietaryNotes: args.dietaryNotes ?? null,
        specialInstructions: args.specialInstructions ?? null,
        lineTotalCents: newTotalCents,
      },
    });

    await prisma.student.update({
      where: { id: order.studentId },
      data: {
        teacherName: args.teacherName ?? null,
        classroom: args.classroom ?? null,
        allergyNotes: args.allergyNotes ?? null,
        dietaryNotes: args.dietaryNotes ?? null,
      },
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        subtotalCents: newTotalCents,
        totalCents: newTotalCents,
        specialInstructions,
        payment: { update: { amountCents: newTotalCents } },
      },
      select: { id: true, orderNumber: true, restaurantId: true },
    });

    const noteFragment = args.adminNote ? ` · note: "${args.adminNote.slice(0, 80)}"` : "";
    await logActivity({
      restaurantId: updated.restaurantId,
      adminUserId: args.adminUserId,
      entityType: "ORDER",
      entityId: updated.id,
      action: "MODIFIED",
      summary: `Admin modified order ${updated.orderNumber} — total adjusted to ${formatCurrency(newTotalCents)} (${formatCurrency(refundCents)} refunded)${noteFragment}`,
      metadata: {
        orderNumber: updated.orderNumber,
        newTotalCents,
        refundCents,
        additions: args.additions,
        removals: args.removals,
        adminNote: args.adminNote ?? null,
      },
    });

    return { action: "updated", order: updated };
  }

  // ── Case B: increase via stripe_link — generate delta Checkout URL ──
  if (deltaCents > 0 && adjustmentMode.kind === "stripe_link") {
    if (order.pendingEditCheckoutSession) {
      throw new Error("This order already has a pending edit in progress.");
    }
    if (order.deltaPaymentIntentId) {
      throw new Error("This order has already been increased once and cannot be increased again.");
    }

    const now = new Date();
    const cutoffAt = order.deliveryDate.cutoffAt;
    const msUntilCutoff = cutoffAt.getTime() - now.getTime();
    if (msUntilCutoff < 30 * 60 * 1000) {
      throw new Error("Too close to cutoff — the parent cannot pay a delta checkout in time.");
    }

    const twentyFourHoursFromNow = now.getTime() + 24 * 60 * 60 * 1000 - 60_000;
    const expiresAt = Math.floor(Math.min(cutoffAt.getTime(), twentyFourHoursFromNow) / 1000);

    const newItemsJson = JSON.stringify({
      additions: args.additions,
      removals: args.removals,
      allergyNotes: args.allergyNotes ?? null,
      dietaryNotes: args.dietaryNotes ?? null,
      specialInstructions: args.specialInstructions ?? null,
      lineTotalCents: newTotalCents,
    });

    const session = await createOrderEditCheckoutSession({
      orderId: order.id,
      orderNumber: order.orderNumber,
      parentEmail: order.parentEmail,
      deltaCents,
      newTotalCents,
      newItemsJson,
      stripeAccountId: order.restaurant.stripeAccountId,
      expiresAt,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        pendingEditTotalCents: newTotalCents,
        pendingEditCheckoutSession: session.id,
        pendingEditCreatedAt: now,
      },
    });

    return { action: "checkout_required", checkoutUrl: session.url! };
  }

  // ── Case C: increase via manual or comped — apply immediately, no Stripe ──
  await prisma.orderItem.update({
    where: { id: item.id },
    data: {
      additions: args.additions,
      removals: args.removals,
      allergyNotes: args.allergyNotes ?? null,
      dietaryNotes: args.dietaryNotes ?? null,
      specialInstructions: args.specialInstructions ?? null,
      lineTotalCents: newTotalCents,
    },
  });

  await prisma.student.update({
    where: { id: order.studentId },
    data: {
      teacherName: args.teacherName ?? null,
      classroom: args.classroom ?? null,
      allergyNotes: args.allergyNotes ?? null,
      dietaryNotes: args.dietaryNotes ?? null,
    },
  });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      subtotalCents: newTotalCents,
      totalCents: newTotalCents,
      specialInstructions,
      payment: { update: { amountCents: newTotalCents } },
    },
    select: { id: true, orderNumber: true, restaurantId: true },
  });

  const noteFragment = args.adminNote ? ` · note: "${args.adminNote.slice(0, 80)}"` : "";
  const modeFragment = deltaCents > 0
    ? adjustmentMode.kind === "comped"
      ? ` (increase comped${adjustmentMode.kind === "comped" && adjustmentMode.reason ? `: ${adjustmentMode.reason}` : ""})`
      : ` (increase recorded as ${adjustmentMode.kind === "manual" ? adjustmentMode.method : "manual"})`
    : "";

  await logActivity({
    restaurantId: updated.restaurantId,
    adminUserId: args.adminUserId,
    entityType: "ORDER",
    entityId: updated.id,
    action: deltaCents !== 0 ? "MODIFIED" : "MODIFIED",
    summary: `Admin modified order ${updated.orderNumber} — total ${formatCurrency(newTotalCents)}${modeFragment}${noteFragment}`,
    metadata: {
      orderNumber: updated.orderNumber,
      newTotalCents,
      deltaCents,
      additions: args.additions,
      removals: args.removals,
      adminNote: args.adminNote ?? null,
      adjustmentMode: adjustmentMode.kind,
    },
  });

  return { action: "updated", order: updated };
}

/**
 * Admin-only: swap the menu item on an order line for a different one
 * (e.g. a parent calls to say "change Tuesday's burger to the chicken bowl").
 *
 * Bypasses the cutoff, like updateOrderAsAdmin. The new item must be on the
 * menu for this order's delivery date. The line is re-priced from the new
 * item (size + add-ons), any existing order-level discount is kept as-is, and
 * the difference is handled the same three ways as updateOrderAsAdmin:
 *   decrease        — partial Stripe refund of the difference
 *   increase        — stripe_link (delta Checkout) / manual / comped
 *   same price      — applied immediately
 *
 * Callers MUST gate this at MANAGER+ (it can move money).
 */
export async function swapOrderItemAsAdmin(args: {
  orderId: string;
  /** REQUIRED — multi-tenant scoping. The admin's restaurantId. */
  restaurantId: string;
  adminUserId?: string;
  /** Which line to swap. Defaults to the first line. */
  orderItemId?: string;
  newMenuItemId: string;
  /** Size name — required when the new item has sizes. */
  size?: string;
  /** Required top-level choice — required when the new item has requiredChoices. */
  choice?: string;
  additions?: string[];
  removals?: string[];
  adminNote?: string;
  adjustmentMode?: AdminAdjustmentMode;
}): Promise<OrderUpdateResult> {
  const adjustmentMode: AdminAdjustmentMode = args.adjustmentMode ?? { kind: "comped" };
  const additions = args.additions ?? [];
  const removals = args.removals ?? [];

  const order = await prisma.order.findFirst({
    where: { id: args.orderId, restaurantId: args.restaurantId },
    include: {
      deliveryDate: true,
      items: true,
      payment: true,
      restaurant: { select: { stripeAccountId: true } },
    },
  });
  if (!order) throw new Error("Order not found.");

  if (order.status !== OrderStatus.PAID) {
    throw new Error("Only paid orders can be swapped. Cancel or refund this order instead.");
  }
  if (order.archivedAt) throw new Error("This order is archived.");
  if (order.pendingEditCheckoutSession) {
    throw new Error("This order has a payment link outstanding. Wait for it to be paid or expire before swapping.");
  }

  const item = args.orderItemId
    ? order.items.find((i) => i.id === args.orderItemId)
    : order.items[0];
  if (!item) throw new Error("Order item not found.");
  if (item.refundedAt) throw new Error("This item has already been refunded.");
  if (order.refundAmountCents > 0) {
    throw new Error("This order has a partial refund. Swapping it isn't supported — cancel and re-create instead.");
  }

  // The new item must belong to this restaurant AND be on the menu for this
  // delivery date (tenant-scoped; blocks swapping to arbitrary/inactive items).
  const availability = await prisma.deliveryMenuItem.findFirst({
    where: {
      deliveryDateId: order.deliveryDateId,
      menuItemId: args.newMenuItemId,
      isAvailable: true,
      menuItem: { restaurantId: args.restaurantId, isActive: true },
    },
    include: {
      menuItem: {
        include: {
          options: true,
          sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      },
    },
  });
  if (!availability) {
    throw new Error("That item isn't available on this order's delivery date.");
  }
  const newItem = availability.menuItem;

  const addOnSet = new Set(newItem.options.filter((o) => o.optionType === "ADD_ON").map((o) => o.name));
  const removalSet = new Set(newItem.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name));
  if (!additions.every((v) => addOnSet.has(v))) throw new Error(`One or more add-ons are invalid for ${newItem.name}.`);
  if (!removals.every((v) => removalSet.has(v))) throw new Error(`One or more removals are invalid for ${newItem.name}.`);

  const requiredChoices = getRequiredChoicesForMenuItem(newItem);
  if (requiredChoices.length && (!args.choice || !requiredChoices.includes(args.choice))) {
    throw new Error(`Choose a required option for ${newItem.name}.`);
  }

  let basePriceCents: number;
  let sizeName: string | null = null;
  if (newItem.sizes.length > 0) {
    const size = newItem.sizes.find((s) => s.name === args.size);
    if (!size) throw new Error(`Choose a valid size for ${newItem.name}.`);
    basePriceCents = size.priceCents;
    sizeName = size.name;
  } else {
    basePriceCents = newItem.basePriceCents;
  }

  const newLineTotalCents = resolveLineItemPrice({
    basePriceCents,
    additions: newItem.options.filter((o) => additions.includes(o.name)),
  });

  // Keep the order's existing discount amount; only the subtotal moves.
  const newSubtotalCents = order.subtotalCents - item.lineTotalCents + newLineTotalCents;
  const newTotalCents = Math.max(0, newSubtotalCents - order.discountCents);
  const deltaCents = newTotalCents - order.totalCents;

  const storedAdditions = args.choice ? [args.choice, ...additions] : additions;
  const itemData = {
    menuItemId: newItem.id,
    itemNameSnapshot: newItem.name,
    basePriceCents,
    sizeName,
    additions: storedAdditions,
    removals,
    lineTotalCents: newLineTotalCents,
  };

  const specialInstructions = args.adminNote
    ? `[Admin note: ${args.adminNote}]${order.specialInstructions ? `\n${order.specialInstructions}` : ""}`
    : order.specialInstructions;

  const fromLabel = `${item.itemNameSnapshot}${item.sizeName ? ` (${item.sizeName})` : ""}`;
  const toLabel = `${newItem.name}${sizeName ? ` (${sizeName})` : ""}`;

  // ── Increase via Stripe link: nothing changes until the parent pays ──
  if (deltaCents > 0 && adjustmentMode.kind === "stripe_link") {
    if (order.deltaPaymentIntentId) {
      throw new Error("This order has already been increased once and cannot be increased again.");
    }
    const now = new Date();
    const cutoffAt = order.deliveryDate.cutoffAt;
    if (cutoffAt.getTime() - now.getTime() < 30 * 60 * 1000) {
      throw new Error("Too close to cutoff for a payment link — use manual or comped instead.");
    }
    const expiresAt = Math.floor(
      Math.min(cutoffAt.getTime(), now.getTime() + 24 * 60 * 60 * 1000 - 60_000) / 1000
    );

    // Stripe caps a metadata value at 500 chars, so this payload is kept
    // minimal (notes/allergies are left untouched by the webhook when absent).
    const newItemsJson = JSON.stringify({
      orderItemId: item.id,
      menuItemId: newItem.id,
      itemNameSnapshot: newItem.name,
      basePriceCents,
      sizeName,
      additions: storedAdditions,
      removals,
      lineTotalCents: newLineTotalCents,
    });
    if (newItemsJson.length > 480) {
      throw new Error("This swap has too many customizations for a payment link — use manual or comped instead.");
    }

    const session = await createOrderEditCheckoutSession({
      orderId: order.id,
      orderNumber: order.orderNumber,
      parentEmail: order.parentEmail,
      deltaCents,
      newTotalCents,
      newItemsJson,
      stripeAccountId: order.restaurant.stripeAccountId,
      expiresAt,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        pendingEditTotalCents: newTotalCents,
        pendingEditCheckoutSession: session.id,
        pendingEditCreatedAt: now,
      },
    });

    await logActivity({
      restaurantId: order.restaurantId,
      adminUserId: args.adminUserId,
      entityType: "ORDER",
      entityId: order.id,
      action: "MODIFIED",
      summary: `Admin started item swap on order ${order.orderNumber}: ${fromLabel} → ${toLabel} — awaiting payment of ${formatCurrency(deltaCents)}`,
      metadata: { orderNumber: order.orderNumber, fromItem: fromLabel, toItem: toLabel, deltaCents, adjustmentMode: "stripe_link" },
    });

    return { action: "checkout_required", checkoutUrl: session.url! };
  }

  // ── Decrease: refund the difference first, then apply ──
  let refundCents = 0;
  if (deltaCents < 0) {
    refundCents = -deltaCents;
    const isStripePayment = order.payment?.provider === "stripe" || order.payment?.provider === "stripe_checkout_link";
    if (isStripePayment) {
      const paymentIntentId = order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;
      if (!paymentIntentId) {
        throw new Error("Cannot issue refund: Stripe order is missing a payment intent. Contact support.");
      }
      if (!stripe) throw new Error("Stripe is not configured — cannot issue the refund.");
      await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: refundCents,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            itemSwap: "true",
            adminUserId: args.adminUserId ?? "unknown",
          },
        },
        // updatedAt changes after every applied change, so a later swap with
        // the same numbers gets a fresh key; a retry of this one reuses it.
        { idempotencyKey: `swap-decrease-${order.id}-${item.id}-${newItem.id}-${newTotalCents}-${item.updatedAt.getTime()}` }
      );
    }
    // Non-Stripe (manual/comped) payments: no refund call — admin settles offline.
  }

  // ── Apply the swap (decrease after refund, increase manual/comped, or same price) ──
  await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({ where: { id: item.id }, data: itemData });
    await tx.order.update({
      where: { id: order.id },
      data: {
        subtotalCents: newSubtotalCents,
        totalCents: newTotalCents,
        specialInstructions,
        ...(order.payment ? { payment: { update: { amountCents: newTotalCents } } } : {}),
      },
    });
  });

  const noteFragment = args.adminNote ? ` · note: "${args.adminNote.slice(0, 80)}"` : "";
  const moneyFragment =
    deltaCents < 0
      ? ` (${formatCurrency(refundCents)} refunded)`
      : deltaCents > 0
        ? adjustmentMode.kind === "comped"
          ? ` (+${formatCurrency(deltaCents)} comped${adjustmentMode.reason ? `: ${adjustmentMode.reason}` : ""})`
          : ` (+${formatCurrency(deltaCents)} recorded as ${adjustmentMode.kind === "manual" ? adjustmentMode.method : "manual"})`
        : "";

  await logActivity({
    restaurantId: order.restaurantId,
    adminUserId: args.adminUserId,
    entityType: "ORDER",
    entityId: order.id,
    action: "MODIFIED",
    summary: `Admin swapped item on order ${order.orderNumber}: ${fromLabel} → ${toLabel}${moneyFragment}${noteFragment}`,
    metadata: {
      orderNumber: order.orderNumber,
      fromItem: fromLabel,
      toItem: toLabel,
      newTotalCents,
      deltaCents,
      refundCents,
      adjustmentMode: adjustmentMode.kind,
      adminNote: args.adminNote ?? null,
    },
  });

  return { action: "updated", order: { id: order.id, orderNumber: order.orderNumber, restaurantId: order.restaurantId } };
}

type CancellationQuoteOrder = {
  id: string;
  restaurantId: string;
  parentUserId: string | null;
  parentEmail: string | null;
  deliveryDate: { deliveryDate: Date };
  school: { timezone: string };
};

export type CancellationAdjustment = RepriceAdjustment & {
  orderNumber: string;
  discountId: string;
  discountName: string;
  redemptionId: string;
};

/**
 * Multi-day ("weekly streak") discounts depend on how many days a family
 * orders in a week. If a parent cancels an earlier paid day and that makes a
 * later day drop a tier, the discount that day no longer earns is withheld
 * from this cancellation's refund (tax-grossed, because tax was charged on
 * the discounted price) and moved onto the later order so every order's
 * recorded discount matches what the family really bought.
 */
export async function buildCancellationQuote(order: CancellationQuoteOrder & { totalCents: number }) {
  const adjustments: CancellationAdjustment[] = [];
  const familyMatch: Prisma.OrderWhereInput[] = [];
  if (order.parentUserId) familyMatch.push({ parentUserId: order.parentUserId });
  const email = order.parentEmail?.trim();
  if (email) familyMatch.push({ parentEmail: { equals: email, mode: "insensitive" } });

  if (familyMatch.length > 0) {
    const { start, end } = weekWindow(order.deliveryDate.deliveryDate, order.school.timezone);
    const rows = await prisma.order.findMany({
      where: {
        restaurantId: order.restaurantId,
        status: { in: [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED] },
        archivedAt: null,
        OR: familyMatch,
        deliveryDate: { deliveryDate: { gte: start, lt: end } },
      },
      select: {
        id: true,
        orderNumber: true,
        subtotalCents: true,
        discountCents: true,
        totalCents: true,
        deliveryDate: { select: { deliveryDate: true } },
        discountRedemption: {
          select: { id: true, discountId: true, discount: { select: { id: true, name: true, templateKind: true, weeklyTiers: true } } },
        },
      },
    });

    if (rows.some((r) => r.id === order.id)) {
      const groups = new Map<string, (typeof rows)[number]["discountRedemption"]>();
      for (const r of rows) {
        const red = r.discountRedemption;
        if (red && red.discount.templateKind === "MULTI_DAY") groups.set(red.discountId, red);
      }
      for (const red of groups.values()) {
        if (!red) continue;
        const tiers = parseWeeklyTiers(red.discount.weeklyTiers);
        if (tiers.length === 0) continue;
        const plan = planMultiDayReprice({
          tiers,
          timezone: order.school.timezone,
          cancelledId: order.id,
          orders: rows.map((r) => ({
            id: r.id,
            deliveryDate: r.deliveryDate.deliveryDate,
            subtotalCents: r.subtotalCents,
            totalCents: r.totalCents,
            // Only this discount's own orders are repriced; others count for days only.
            discountCents: r.discountRedemption?.discountId === red.discountId ? r.discountCents : 0,
          })),
        });
        for (const adj of plan) {
          const row = rows.find((r) => r.id === adj.orderId);
          if (!row?.discountRedemption) continue;
          adjustments.push({
            ...adj,
            orderNumber: row.orderNumber,
            discountId: red.discountId,
            discountName: red.discount.name,
            redemptionId: row.discountRedemption.id,
          });
        }
      }
    }
  }

  const withheldCents = Math.min(
    order.totalCents,
    adjustments.reduce((sum, a) => sum + a.addCents, 0)
  );
  return { withheldCents, refundCents: Math.max(0, order.totalCents - withheldCents), adjustments };
}

/** Weekly-checkout orders don't carry their own PaymentIntent — the whole
 *  week was one Stripe charge. Find it through the batch item they came from. */
async function findWeeklyBatchPaymentIntent(order: {
  parentUserId: string | null;
  parentChildId: string | null;
  deliveryDateId: string;
}) {
  if (!order.parentUserId || !order.parentChildId) return null;
  const item = await prisma.weeklyCheckoutBatchItem.findFirst({
    where: {
      deliveryDateId: order.deliveryDateId,
      parentChildId: order.parentChildId,
      weeklyCheckoutBatch: { parentUserId: order.parentUserId, status: "PAID", paymentIntentId: { not: null } },
    },
    orderBy: { createdAt: "desc" },
    select: { weeklyCheckoutBatch: { select: { paymentIntentId: true } } },
  });
  return item?.weeklyCheckoutBatch.paymentIntentId ?? null;
}

/** Read-only preview shown to the parent before they confirm a cancel. */
export async function getCancellationQuote(args: { orderId: string; parentUserId?: string; guestToken?: string }) {
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    include: { school: true, deliveryDate: true },
  });
  if (!order) throw new Error("Order not found.");
  let authorized = false;
  if (args.parentUserId && order.parentUserId === args.parentUserId) authorized = true;
  else if (args.guestToken) {
    const { verifyOrderCancelToken } = await import("@/lib/order-tokens");
    if (verifyOrderCancelToken(args.guestToken, order.id)) authorized = true;
  }
  if (!authorized) throw new Error("Not authorized to view this order.");
  const quote = await buildCancellationQuote(order);
  return {
    totalCents: order.totalCents,
    refundCents: quote.refundCents,
    withheldCents: quote.withheldCents,
    adjustments: quote.adjustments.map((a) => ({
      orderNumber: a.orderNumber,
      discountName: a.discountName,
      lostDiscountCents: a.lostDiscountCents,
      addCents: a.addCents,
    })),
  };
}

/**
 * Customer-initiated cancel + refund.
 *
 * Auth model: caller must prove ownership of the order via ONE of:
 *   - `parentUserId` matching `order.parentUserId` (authenticated parent)
 *   - `guestToken` — a signed token issued by the post-checkout success
 *     page, bound to this specific orderId. Lets guests (no account)
 *     cancel an order they just placed without having to sign in.
 *
 * Either path lands at the same Stripe refund + status update + activity
 * log. The hard ceiling on cancellability remains `deliveryDate.cutoffAt`
 * regardless of which proof was presented.
 */
export async function cancelOrderWithRefund(args: {
  orderId: string;
  parentUserId?: string;
  guestToken?: string;
}) {
  const { orderId, parentUserId, guestToken } = args;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: true,
      payment: true,
      restaurant: { select: { stripeAccountId: true } },
    },
  });

  if (!order) throw new Error("Order not found.");

  // Authorize: either an authenticated parent who owns the order, or a
  // valid signed token issued specifically for this orderId.
  let authorized = false;
  if (parentUserId && order.parentUserId === parentUserId) {
    authorized = true;
  } else if (guestToken) {
    // Lazy import keeps the token module out of any orders.ts consumer
    // that doesn't need it (the function's signature is fine with
    // guestToken undefined).
    const { verifyOrderCancelToken } = await import("@/lib/order-tokens");
    if (verifyOrderCancelToken(guestToken, order.id)) authorized = true;
  }
  if (!authorized) throw new Error("Not authorized to cancel this order.");

  if (order.status !== OrderStatus.PAID) throw new Error("Only paid orders can be cancelled.");

  assertOrderingOpen(
    new Date(),
    order.deliveryDate.cutoffAt,
    order.deliveryDate.deliveryDate,
    order.school.timezone
  );

  const ownPaymentIntentId = order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;
  const batchPaymentIntentId = ownPaymentIntentId ? null : await findWeeklyBatchPaymentIntent(order);
  const paymentIntentId = ownPaymentIntentId ?? batchPaymentIntentId;
  const quote = await buildCancellationQuote(order);
  let stripeRefundIssued = false;

  if (stripe) {
    // Multi-PI: refund delta charge first (if an increase-edit was finalized),
    // then refund the original charge. Both calls outside any DB transaction.
    if (order.deltaPaymentIntentId && (order.deltaAmountCents ?? 0) > 0) {
      await stripe.refunds.create({
        payment_intent: order.deltaPaymentIntentId,
        reason: "requested_by_customer",
      });
    }

    if (paymentIntentId) {
      // Weekly-batch orders share one PaymentIntent, so they must be refunded
      // by amount (never the whole charge). A withheld multi-day clawback also
      // forces a partial refund.
      const paidOnMain = (order.payment?.amountCents ?? order.totalCents) - (order.deltaPaymentIntentId ? order.deltaAmountCents ?? 0 : 0);
      const mainRefund = Math.max(0, (batchPaymentIntentId ? order.totalCents : paidOnMain) - quote.withheldCents);
      const needsAmount = Boolean(batchPaymentIntentId) || quote.withheldCents > 0;
      if (mainRefund > 0) {
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
          ...(needsAmount ? { amount: mainRefund } : {}),
          reason: "requested_by_customer",
        });
        stripeRefundIssued = true;
      }
    }
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { orderId: order.id },
      data: { status: PaymentStatus.REFUNDED, refundedAt: now },
    });

    // Move the discount the later days no longer earn onto those orders so
    // discountCents / totalCents / the redemption ledger stay truthful.
    for (const adj of quote.adjustments) {
      await tx.order.update({
        where: { id: adj.orderId },
        data: { discountCents: adj.newDiscountCents, totalCents: adj.newTotalCents },
      });
      await tx.payment.updateMany({
        where: { orderId: adj.orderId },
        data: {
          amountCents: adj.newTotalCents,
          notes: `Includes ${formatCurrency(adj.addCents)} kept from cancelled order ${order.orderNumber} (multi-day discount no longer earned)`,
        },
      });
      if (adj.newDiscountCents > 0) {
        await tx.discountRedemption.update({ where: { id: adj.redemptionId }, data: { amountCents: adj.newDiscountCents } });
      } else {
        await tx.discountRedemption.delete({ where: { id: adj.redemptionId } });
        await tx.discount.update({ where: { id: adj.discountId }, data: { currentRedemptions: { decrement: 1 } } });
      }
    }

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: now,
        refundedAt: now,
      },
      include: {
        school: true,
        deliveryDate: true,
        student: true,
        items: true,
      },
    });
  }).then(async (cancelled) => {
    const actorTag = parentUserId ? "Customer" : "Guest customer";
    const refundedDescription = stripeRefundIssued
      ? `${actorTag} cancelled order ${cancelled.orderNumber} — ${formatCurrency(quote.refundCents)} refunded via Stripe${quote.withheldCents > 0 ? ` (${formatCurrency(quote.withheldCents)} multi-day discount withheld)` : ""}`
      : `${actorTag} cancelled order ${cancelled.orderNumber} (no payment intent — manual refund may be required)`;
    await logActivity({
      restaurantId: cancelled.restaurantId,
      parentUserId: parentUserId ?? null,
      entityType: "ORDER",
      entityId: cancelled.id,
      action: "CANCELLED",
      summary: refundedDescription,
      metadata: {
        orderNumber: cancelled.orderNumber,
        totalCents: cancelled.totalCents,
        refundCents: quote.refundCents,
        withheldCents: quote.withheldCents,
        adjustedOrders: quote.adjustments.map((a) => ({ orderId: a.orderId, addCents: a.addCents, newDiscountCents: a.newDiscountCents })),
        refundIssued: stripeRefundIssued,
        deltaRefundIssued: Boolean(order.deltaPaymentIntentId),
        viaGuestToken: !parentUserId && Boolean(guestToken),
      },
    });
    return cancelled;
  });
}
