import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { setOrderArchived, setOrderStatus } from "@/lib/admin";
import { assertAdminApiRequest } from "@/lib/admin-auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    await assertAdminApiRequest();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;
  const body = await request.json();

  try {
    switch (body.action) {
      case "resend_confirmation":
        await sendOrderConfirmationEmail(orderId);
        return NextResponse.json({ ok: true });
      case "refund":
        await setOrderStatus(orderId, OrderStatus.REFUNDED);
        return NextResponse.json({ ok: true });
      case "cancel":
        await setOrderStatus(orderId, OrderStatus.CANCELLED);
        return NextResponse.json({ ok: true });
      case "archive":
        await setOrderArchived(orderId, true);
        return NextResponse.json({ ok: true });
      case "unarchive":
        await setOrderArchived(orderId, false);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    await assertAdminApiRequest();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { school: true, deliveryDate: true, student: true, items: true, payment: true, emailLogs: true }
  });
  return NextResponse.json({ order });
}
