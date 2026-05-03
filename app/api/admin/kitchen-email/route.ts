import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendKitchenPrepEmail } from "@/lib/email/service";

/**
 * POST /api/admin/kitchen-email
 * Body: { deliveryDateId: string }
 * Sends the kitchen prep sheet email to the restaurant's contact email.
 * Requires an authenticated admin session.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { deliveryDateId } = body as { deliveryDateId?: string };

    if (!deliveryDateId) {
      return NextResponse.json({ error: "deliveryDateId is required." }, { status: 400 });
    }

    const result = await sendKitchenPrepEmail(deliveryDateId);
    return NextResponse.json({ ok: true, ordersCount: result.ordersCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send kitchen email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
