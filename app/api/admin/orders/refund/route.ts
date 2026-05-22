import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { issueOrderRefund } from "@/lib/refund";
import { sendRefundEmail } from "@/lib/email/service";

export async function POST(request: Request) {
  let restaurantId: string;
  try {
    ({ restaurantId } = await assertAdminApiRequest());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await auth();
  const adminUserId = (session?.user as { adminUserId?: string })?.adminUserId;

  if (!adminUserId) {
    return NextResponse.json({ error: "Admin user not found" }, { status: 401 });
  }

  const body = await request.json();
  const { orderId, amountCents, itemIds } = body;

  if (!orderId || typeof amountCents !== "number") {
    return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  // itemIds is optional — present only for "select items" refunds. It
  // tells issueOrderRefund which OrderItem rows to stamp as refunded.
  const refundedItemIds = Array.isArray(itemIds)
    ? itemIds.filter((id): id is string => typeof id === "string")
    : undefined;

  try {
    await issueOrderRefund({
      orderId,
      restaurantId,
      adminUserId,
      amountCents,
      refundedItemIds,
    });

    // Send refund email (best-effort).
    await sendRefundEmail(orderId, restaurantId, amountCents).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
