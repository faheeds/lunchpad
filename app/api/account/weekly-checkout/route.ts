import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createWeeklyStripeCheckoutSession } from "@/lib/payments/checkout";
import { createWeeklyCheckoutBatch } from "@/lib/weekly-checkout";
import { assertParentApiRequest } from "@/lib/parent-auth";

export async function POST() {
  try {
    const session = await assertParentApiRequest();
    const parentUserId = session.user?.parentUserId;

    if (!parentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const batch = await createWeeklyCheckoutBatch(parentUserId);
    const stripeSession = await createWeeklyStripeCheckoutSession({
      batchId: batch.id,
      parentEmail: batch.parentUser.email,
      lineItems: batch.items.map((item) => ({
        name: `${item.parentChild.studentName}: ${item.itemNameSnapshot}`,
        description: `${item.deliveryDate.school.name} - ${item.deliveryDate.deliveryDate.toISOString().slice(0, 10)}`,
        amountCents: item.lineTotalCents
      }))
    });

    await prisma.weeklyCheckoutBatch.update({
      where: { id: batch.id },
      data: {
        checkoutSessionId: stripeSession.id
      }
    });

    return NextResponse.json({ checkoutUrl: stripeSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start weekly checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
