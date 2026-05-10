import { NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { listOrders } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { setOrderArchived, adminCancelOrderWithRefund } from "@/lib/admin";

// Bulk action → minimum admin role required to perform it. `cancel` moves
// real money (refunds via Stripe) and is reserved for MANAGER+; archive /
// unarchive / resend are STAFF-allowed because they don't affect funds.
const BULK_ACTION_ROLE: Record<string, "STAFF" | "MANAGER" | "OWNER"> = {
  archive:              "STAFF",
  unarchive:            "STAFF",
  cancel:               "MANAGER",
  resend_confirmation:  "STAFF",
};

export async function GET(request: Request) {
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const orders = await listOrders({
    restaurantId,
    deliveryDateId: searchParams.get("deliveryDateId") ?? undefined,
    schoolIds: searchParams.getAll("schoolIds"),
    status: searchParams.get("status") ?? undefined,
    archived: searchParams.get("archived") ?? undefined
  });

  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = String(body.action ?? "");
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.filter((value: unknown) => typeof value === "string")
    : [];

  if (!orderIds.length) {
    return NextResponse.json({ error: "Select at least one order." }, { status: 400 });
  }

  const requiredRole = BULK_ACTION_ROLE[action];
  if (!requiredRole) {
    return NextResponse.json({ error: "Unsupported bulk action." }, { status: 400 });
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

  // Per-order execution with partial-failure tolerance. Promise.allSettled
  // means a single bad order (e.g. an already-cancelled one) doesn't sink
  // the rest — we report counts back so the operator sees "5 ok, 1 failed
  // (already cancelled)" rather than a blanket "Unable to update."
  async function runOne(orderId: string): Promise<void> {
    switch (action) {
      case "archive":
        await setOrderArchived(restaurantId, orderId, true, adminUserId);
        return;
      case "unarchive":
        await setOrderArchived(restaurantId, orderId, false, adminUserId);
        return;
      case "cancel":
        await adminCancelOrderWithRefund(restaurantId, orderId, adminUserId);
        return;
      case "resend_confirmation":
        await sendOrderConfirmationEmail(orderId, restaurantId);
        return;
    }
  }

  // Cap the number of concurrent calls — Stripe and Resend both rate-limit
  // and unbounded Promise.all() across hundreds of orders is a fast way to
  // get throttled. Process in batches of 8 sequentially.
  const BATCH = 8;
  const results: { orderId: string; ok: boolean; error?: string }[] = [];
  for (let i = 0; i < orderIds.length; i += BATCH) {
    const slice = orderIds.slice(i, i + BATCH);
    const settled = await Promise.allSettled(slice.map((id: string) => runOne(id)));
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        results.push({ orderId: slice[idx], ok: true });
      } else {
        const reason = res.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        results.push({ orderId: slice[idx], ok: false, error: message });
      }
    });
  }

  const successCount = results.filter((r) => r.ok).length;
  const failureCount = results.length - successCount;
  const firstError = results.find((r) => !r.ok)?.error;

  return NextResponse.json({
    ok: failureCount === 0,
    updated: successCount,
    failed: failureCount,
    // Surface the first error verbatim so the UI can show "5 cancelled, 1 failed:
    // <reason>" rather than a generic message.
    firstError: firstError ?? null,
    results,
  });
}
