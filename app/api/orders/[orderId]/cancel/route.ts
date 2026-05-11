import { NextResponse } from "next/server";
import { assertParentApiRequest } from "@/lib/parent-auth";
import { cancelOrderWithRefund } from "@/lib/orders";
import { sendCancellationEmail } from "@/lib/email/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  // Try parent auth — but don't reject up front. Guests can also cancel
  // by passing a signed token in the body (issued on the success page).
  // We use assertParentApiRequest (throws) instead of requireParent
  // (redirects) so this codepath doesn't accidentally swallow a
  // NEXT_REDIRECT and lose the error context.
  let parentUserId: string | undefined;
  try {
    const session = await assertParentApiRequest();
    parentUserId = session.user?.parentUserId;
  } catch {
    // not signed in or wrong tenant — fall through to token check
  }

  // Pull optional token from JSON body. Body may be empty for legacy
  // callers (authenticated parents who don't need a token).
  let guestToken: string | undefined;
  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    if (body && typeof body.token === "string" && body.token.length > 0) {
      guestToken = body.token;
    }
  } catch {
    // empty body or invalid JSON — fine, guestToken stays undefined
  }

  if (!parentUserId && !guestToken) {
    return NextResponse.json(
      { error: "Sign in or use the cancel link from your confirmation to cancel this order." },
      { status: 401 },
    );
  }

  try {
    const order = await cancelOrderWithRefund({ orderId, parentUserId, guestToken });

    // Best-effort cancellation email — don't let email failure block the response.
    sendCancellationEmail(order.id, order.restaurantId).catch(() => {});

    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
