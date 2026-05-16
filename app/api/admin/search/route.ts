import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertAdminApiRequest } from "@/lib/admin-auth";

export async function GET(request: Request) {
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest("STAFF"));
  } catch (err) {
    const status = err instanceof Error && err.message === "Insufficient permissions" ? 403 : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (!query || query.length < 2) {
    return NextResponse.json({
      orders: [],
      menuItems: [],
      schools: [],
      customers: [],
    });
  }

  const searchPattern = `%${query}%`;

  const [orders, menuItems, schools, customers] = await Promise.all([
    // Search orders by parent name, email, or order number
    prisma.order.findMany({
      where: {
        restaurantId,
        OR: [
          { parentName: { contains: query, mode: "insensitive" } },
          { parentEmail: { contains: query, mode: "insensitive" } },
          { orderNumber: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        parentName: true,
        parentEmail: true,
        status: true,
        deliveryDate: {
          select: { deliveryDate: true },
        },
        school: {
          select: { name: true },
        },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),

    // Search menu items by name
    prisma.menuItem.findMany({
      where: {
        restaurantId,
        name: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        category: true,
        basePriceCents: true,
      },
      take: 5,
      orderBy: { name: "asc" },
    }),

    // Search schools by name
    prisma.school.findMany({
      where: {
        restaurantId,
        name: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        locationType: true,
      },
      take: 5,
      orderBy: { name: "asc" },
    }),

    // Search parent users (customers) by name or email
    prisma.parentUser.findMany({
      where: {
        restaurantId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 5,
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    orders: orders.map((order) => ({
      id: order.id,
      label: `${order.orderNumber} — ${order.parentName}`,
      subtitle: order.parentEmail,
      status: order.status,
      schoolName: order.school.name,
      deliveryDate: order.deliveryDate?.deliveryDate,
    })),
    menuItems: menuItems.map((item) => ({
      id: item.id,
      label: item.name,
      category: item.category,
      price: item.basePriceCents,
    })),
    schools: schools.map((school) => ({
      id: school.id,
      label: school.name,
      type: school.locationType,
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      label: customer.name || customer.email,
      email: customer.email,
    })),
  });
}
