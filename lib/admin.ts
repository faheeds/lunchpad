import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";

export async function getAdminDashboardSummary(restaurantId: string) {
  const [paidOrders, refundedOrders, cancelledOrders, schools, upcomingDeliveryDates] = await Promise.all([
    prisma.order.count({ where: { restaurantId, status: OrderStatus.PAID, archivedAt: null } }),
    prisma.order.count({ where: { restaurantId, status: OrderStatus.REFUNDED, archivedAt: null } }),
    prisma.order.count({ where: { restaurantId, status: OrderStatus.CANCELLED, archivedAt: null } }),
    prisma.school.count({ where: { restaurantId, isActive: true } }),
    prisma.deliveryDate.findMany({
      where: { deliveryDate: { gte: new Date() }, school: { restaurantId } },
      include: { school: true },
      take: 5,
      orderBy: { deliveryDate: "asc" }
    })
  ]);

  return {
    paidOrders,
    refundedOrders,
    cancelledOrders,
    schools,
    upcomingDeliveryDates
  };
}

/**
 * Set the status of an order. Tenant-scoped: throws if the order doesn't
 * belong to the given restaurant.
 */
export async function setOrderStatus(restaurantId: string, orderId: string, status: OrderStatus) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found in this restaurant.`);

  const now = new Date();
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      cancelledAt: status === OrderStatus.CANCELLED ? now : null,
      refundedAt: status === OrderStatus.REFUNDED ? now : null,
      payment: status === OrderStatus.REFUNDED ? { update: { status: PaymentStatus.REFUNDED, refundedAt: now } } : undefined
    }
  });
}

/**
 * Admin-only cancel + refund. Skips cutoff and parentUserId checks.
 * Issues a Stripe refund if a paymentIntent exists, then marks the order cancelled.
 * Tenant-scoped: throws if the order doesn't belong to the given restaurant.
 */
export async function adminCancelOrderWithRefund(restaurantId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { payment: true },
  });

  if (!order) throw new Error(`Order ${orderId} not found in this restaurant.`);
  if (order.status !== OrderStatus.PAID) {
    throw new Error(`Order ${orderId} is not in PAID status.`);
  }

  const paymentIntentId = order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;

  if (stripe && paymentIntentId) {
    try {
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Log but don't block — the order can still be cancelled in the DB
      console.error(`[admin-cancel] Stripe refund failed for order ${orderId}:`, msg);
    }
  }

  const now = new Date();
  return prisma.$transaction([
    prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { status: PaymentStatus.REFUNDED, refundedAt: now },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED, cancelledAt: now, refundedAt: now },
    }),
  ]);
}

/**
 * Tenant-scoped: throws if the order doesn't belong to the given restaurant.
 */
export async function setOrderArchived(restaurantId: string, orderId: string, archived: boolean) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found in this restaurant.`);

  return prisma.order.update({
    where: { id: orderId },
    data: {
      archivedAt: archived ? new Date() : null
    }
  });
}

export async function getAdminReports(
  restaurantId: string,
  filters: {
    schoolIds?: string[];
    deliveryDateId?: string;
    dateFrom?: string;
    dateTo?: string;
  }
) {
  const deliveryDateFilter =
    filters.dateFrom || filters.dateTo
      ? {
          gte: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : undefined,
          lte: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : undefined
        }
      : undefined;

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: OrderStatus.PAID,
      archivedAt: null,
      deliveryDateId: filters.deliveryDateId || undefined,
      schoolId: filters.schoolIds?.length ? { in: filters.schoolIds } : undefined,
      deliveryDate: deliveryDateFilter ? { deliveryDate: deliveryDateFilter } : undefined
    },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: true
    },
    orderBy: [{ deliveryDate: { deliveryDate: "asc" } }, { createdAt: "asc" }]
  });

  const totalSalesCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
  const totalOrders = orders.length;
  const totalItemsSold = orders.reduce((sum, order) => sum + order.items.length, 0);

  const schoolBreakdownMap = new Map<
    string,
    { schoolId: string; schoolName: string; orders: number; itemsSold: number; salesCents: number }
  >();
  const itemBreakdownMap = new Map<
    string,
    { itemName: string; quantity: number; salesCents: number; bySchool: Record<string, number> }
  >();

  for (const order of orders) {
    const schoolEntry = schoolBreakdownMap.get(order.schoolId) ?? {
      schoolId: order.schoolId,
      schoolName: order.school.name,
      orders: 0,
      itemsSold: 0,
      salesCents: 0
    };

    schoolEntry.orders += 1;
    schoolEntry.itemsSold += order.items.length;
    schoolEntry.salesCents += order.totalCents;
    schoolBreakdownMap.set(order.schoolId, schoolEntry);

    for (const item of order.items) {
      const itemEntry = itemBreakdownMap.get(item.itemNameSnapshot) ?? {
        itemName: item.itemNameSnapshot,
        quantity: 0,
        salesCents: 0,
        bySchool: {}
      };

      itemEntry.quantity += 1;
      itemEntry.salesCents += item.lineTotalCents;
      itemEntry.bySchool[order.school.name] = (itemEntry.bySchool[order.school.name] ?? 0) + 1;
      itemBreakdownMap.set(item.itemNameSnapshot, itemEntry);
    }
  }

  const schoolBreakdown = [...schoolBreakdownMap.values()].sort((a, b) => b.salesCents - a.salesCents);
  const itemBreakdown = [...itemBreakdownMap.values()].sort((a, b) => b.quantity - a.quantity);

  return {
    totals: {
      totalOrders,
      totalItemsSold,
      totalSalesCents
    },
    schoolBreakdown,
    itemBreakdown,
    orders
  };
}
