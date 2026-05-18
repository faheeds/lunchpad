import { NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

type SearchResult = {
  orders: Array<{ id: string; orderNumber: string; parentName: string; deliveryDateId: string }>;
  menuItems: Array<{ id: string; name: string }>;
  schools: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string | null; email: string }>;
};

export async function GET(request: Request) {
  try {
    const { restaurantId } = await assertAdminApiRequest("STAFF");
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") ?? "").trim();

    const result: SearchResult = {
      orders: [],
      menuItems: [],
      schools: [],
      customers: [],
    };

    if (query.length === 0) {
      return NextResponse.json(result);
    }

    // Search orders by order number or parent name
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        OR: [
          { orderNumber: { contains: query, mode: "insensitive" } },
          { parentName: { contains: query, mode: "insensitive" } },
          { parentEmail: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        parentName: true,
        deliveryDateId: true,
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    });
    result.orders = orders;

    // Search menu items by name or description
    const menuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
      },
      take: 5,
      orderBy: { name: "asc" },
    });
    result.menuItems = menuItems;

    // Search schools by name
    const schools = await prisma.school.findMany({
      where: {
        restaurantId,
        name: { contains: query, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
      },
      take: 5,
      orderBy: { name: "asc" },
    });
    result.schools = schools;

    // Search parent customers by name or email
    const customers = await prisma.parentUser.findMany({
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
    });
    result.customers = customers;

    return NextResponse.json(result);
  } catch (error) {
    const emptyResult: SearchResult = {
      orders: [],
      menuItems: [],
      schools: [],
      customers: [],
    };
    return NextResponse.json(emptyResult, { status: 401 });
  }
}
