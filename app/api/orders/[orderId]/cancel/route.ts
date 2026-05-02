import { NextResponse } from "next/server";
import { requireParent } from "@/lib/parent-auth";
import { cancelOrderWithRefund } from "@/lib/orders";
import { sendCancellationEmail } from "@/lib/email/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  let session;
  try {
    session = await requireParent();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  try {
    const order = await cancelOrderWithRefund(orderId, parentUserId);

    // Best-effort cancellation email — don't let email failure block the response.
    sendCancellationEmail(order.id).catch(() => {});

    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
