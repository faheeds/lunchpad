import { NextResponse } from "next/server";
import { previewWeeklyCheckoutBatch } from "@/lib/weekly-checkout";
import { parseWeekScope } from "@/lib/weekly-week";
import { assertParentApiRequest } from "@/lib/parent-auth";
import { logException } from "@/lib/log";
import { formatApiError } from "@/lib/format-api-error";

/**
 * Read-only price preview for "Checkout week". Runs the same builder and
 * discount engine as POST /api/account/weekly-checkout but writes nothing,
 * so the cart can show the discount before the parent is sent to Stripe.
 * Sales tax is added on Stripe's page and is not included here.
 */
export async function GET(request: Request) {
  let parentUserId: string | undefined;
  try {
    const session = await assertParentApiRequest();
    parentUserId = session.user?.parentUserId;
    if (!parentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const preview = await previewWeeklyCheckoutBatch(
      parentUserId,
      undefined,
      parseWeekScope(new URL(request.url).searchParams.get("week"))
    );
    return NextResponse.json({ preview });
  } catch (error) {
    logException(error, "weekly_checkout_preview_failed", { parentUserId });
    return NextResponse.json(
      { error: formatApiError(error, "Unable to load your week's total.") },
      { status: 400 }
    );
  }
}
