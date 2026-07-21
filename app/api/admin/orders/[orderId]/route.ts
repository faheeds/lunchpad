import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { setOrderArchived, setOrderStatus, adminCancelOrderWithRefund } from "@/lib/admin";
import { assertAdminApiRequest } from "@/lib/admin-auth";

// Single-order quick-action → minimum admin role required. `cancel` moves real
// money (issues a Stripe refund via adminCancelOrderWithRefund) and is reserved
// for MANAGER+, matching the bulk endpoint in ../route.ts. Archive / unarchive
// / resend don't touch funds and are STAFF-allowed.
const ACTION_ROLE: Record<string, "STAFF" | "MANAGER" | "OWNER"> = {
  resend_confirmation: "STAFF",
  refund:              "MANAGER",
  cancel:              "MANAGER",
  archive:             "STAFF",
  unarchive:           "STAFF",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const body = await request.json();
  const action = String(body.action ?? "");

  const requiredRole = ACTION_ROLE[action];
  if (!requiredRole) {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  // Role-aware admin check — staff can archive/unarchive/resend, but only
  // managers and owners can cancel-with-refund (it touches real money).
  let restaurantId: string;
  let adminUserId: string;
  try {
    ({ restaurantId, adminUserId } = await assertAdminApiRequest(requiredRole));
  } catch (err) {
    const status = err instanceof Error && err.message === "Insufficient permissions" ? 403 : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status });
  }

  try {
    switch (action) {
      case "resend_confirmation":
        await sendOrderConfirmationEmail(orderId, restaurantId);
        return NextResponse.json({ ok: true });
      case "refund":
        await setOrderStatus(restaurantId, orderId, OrderStatus.REFUNDED);
        return NextResponse.json({ ok: true });
      case "cancel":
        // Route quick-cancel through the real refund path so cancelling a
        // paid order always issues a Stripe refund + activity log + email,
        // matching the Refund modal. Previously this called setOrderStatus,
        // which only flipped the DB status and left the payment captured.
        await adminCancelOrderWithRefund(restaurantId, orderId, adminUserId);
        return NextResponse.json({ ok: true });
      case "archive":
        await setOrderArchived(restaurantId, orderId, true, adminUserId);
        return NextResponse.json({ ok: true });
      case "unarchive":
        await setOrderArchived(restaurantId, orderId, false, adminUserId);
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
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;
  // Tenant-scoped: only return the order if it belongs to this admin's restaurant.
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { school: true, deliveryDate: true, student: true, items: true, payment: true, emailLogs: true }
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}
