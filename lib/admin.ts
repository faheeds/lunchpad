import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";

export async function getAdminDashboardSummary() {
  const [paidOrders, refundedOrders, cancelledOrders, schools, upcomingDeliveryDates] = await Promise.all([
    prisma.order.count({ where: { status: OrderStatus.PAID, archivedAt: null, school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } } } }),
    prisma.order.count({ where: { status: OrderStatus.REFUNDED, archivedAt: null, school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } } } }),
    prisma.order.count({ where: { status: OrderStatus.CANCELLED, archivedAt: null, school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } } } }),
    prisma.school.count({ where: { isActive: true, slug: { in: [...ALLOWED_SCHOOL_SLUGS] } } }),
    prisma.deliveryDate.findMany({
      where: { deliveryDate: { gte: new Date() }, school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } } },
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

export async function setOrderStatus(orderId: string, status: OrderStatus) {
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

export async function setOrderArchived(orderId: string, archived: boolean) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      archivedAt: archived ? new Date() : null
    }
  });
}

export async function getAdminReports(filters: {
  schoolIds?: string[];
  deliveryDateId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const deliveryDateFilter =
    filters.dateFrom || filters.dateTo
      ? {
          gte: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : undefined,
          lte: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : undefined
        }
      : undefined;

  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PAID,
      archivedAt: null,
      deliveryDateId: filters.deliveryDateId || undefined,
      schoolId: filters.schoolIds?.length ? { in: filters.schoolIds } : undefined,
      school: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } },
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
