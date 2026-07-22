import { NextResponse } from "next/server";
import { requireParent } from "@/lib/parent-auth";
import { updateOrderBeforeCutoff } from "@/lib/orders";
import { logInfo, logWarn, logException } from "@/lib/log";
import { formatApiError } from "@/lib/format-api-error";

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
    const result = await updateOrderBeforeCutoff({
      orderId,
      parentUserId,
      additions: body.additions ?? [],
      removals: body.removals ?? [],
      allergyNotes: body.allergyNotes,
      specialInstructions: body.specialInstructions,
    });

    if (result.action === "checkout_required") {
      logInfo("order_modify_checkout_required", { orderId, parentUserId });
      return NextResponse.json({ ok: true, action: "checkout_required", checkoutUrl: result.checkoutUrl });
    }

    logInfo("order_modified_successfully", {
      orderId: result.order.id,
      parentUserId,
      hasAdditions: (body.additions?.length ?? 0) > 0,
      hasRemovals: (body.removals?.length ?? 0) > 0,
    });

    return NextResponse.json({ ok: true, action: "updated", orderId: result.order.id });
  } catch (error) {
    logException(error, "order_modify_failed", { orderId, parentUserId });
    const message = formatApiError(error, "Failed to update order.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
