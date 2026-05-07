import { NextResponse } from "next/server";
import { requireParent } from "@/lib/parent-auth";
import { updateOrderBeforeCutoff } from "@/lib/orders";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;

  let body: {
    additions: string[];
    removals: string[];
    allergyNotes?: string;
    specialInstructions?: string;
  };

  try {
    body = await request.json();
  } catch {
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
    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
