import { NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { listOrders } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { setOrderArchived, setOrderStatus } from "@/lib/admin";
import { OrderStatus } from "@prisma/client";

export async function GET(request: Request) {
  try {
    await assertAdminApiRequest();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const orders = await listOrders({
    deliveryDateId: searchParams.get("deliveryDateId") ?? undefined,
    schoolIds: searchParams.getAll("schoolIds"),
    status: searchParams.get("status") ?? undefined,
    archived: searchParams.get("archived") ?? undefined
  });

  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  try {
    await assertAdminApiRequest();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter((value: unknown) => typeof value === "string") : [];

  if (!orderIds.length) {
    return NextResponse.json({ error: "Select at least one order." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "archive":
        await Promise.all(orderIds.map((orderId: string) => setOrderArchived(orderId, true)));
        return NextResponse.json({ ok: true, updated: orderIds.length });
      case "cancel":
        await Promise.all(orderIds.map((orderId: string) => setOrderStatus(orderId, OrderStatus.CANCELLED)));
        return NextResponse.json({ ok: true, updated: orderIds.length });
      case "resend_confirmation":
        for (const orderId of orderIds) {
          await sendOrderConfirmationEmail(orderId);
        }
        return NextResponse.json({ ok: true, updated: orderIds.length });
      default:
        return NextResponse.json({ error: "Unsupported bulk action." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update selected orders.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
