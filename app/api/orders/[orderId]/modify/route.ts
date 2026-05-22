import { NextResponse } from "next/server";
import { requireParent } from "@/lib/parent-auth";
import { updateOrderBeforeCutoff } from "@/lib/orders";
import { logInfo, logWarn, logException } from "@/lib/log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) {
    logWarn("order_modify_unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  logInfo("order_modify_started", { orderId, parentUserId });

  let body: {
    additions: string[];
    removals: string[];
    allergyNotes?: string;
    specialInstructions?: string;
  };

  try {
    body = await request.json();
  } catch {
    logWarn("order_modify_invalid_json", { orderId });
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const order = await updateOrderBeforeCutoff({
      orderId,
      parentUserId,
      additions: body.additions ?? [],
      removals: body.removals ?? [],
      allergyNotes: body.allergyNotes,
      specialInstructions: body.specialInstructions,
    });

    logInfo("order_modified_successfully", {
      orderId: order.id,
      parentUserId,
      hasAdditions: (body.additions?.length ?? 0) > 0,
      hasRemovals: (body.removals?.length ?? 0) > 0,
    });

    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (error) {
    logException(error, "order_modify_failed", { orderId, parentUserId });
    const message = error instanceof Error ? error.message : "Failed to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
