/**
 * Guest "pay offline" checkout for caterers.
 *
 * Customers pick cash or Zelle instead of Stripe. No account is required.
 * The order is confirmed immediately (it appears on kitchen sheets and
 * labels) and the Payment stays PENDING until the operator marks it paid
 * in the admin order page.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createAdminOrder } from "@/lib/orders";
import { orderFormSchema } from "@/lib/validation/order";
import { sendOfflineOrderEmail } from "@/lib/email/offline-order";
import { buildPaymentInstructionLines } from "@/lib/payments/offline-instructions";
import { formatApiError } from "@/lib/format-api-error";
import { logInfo, logWarn, logException } from "@/lib/log";

export const runtime = "nodejs";

const offlineSchema = orderFormSchema.extend({
  paymentMethod: z.enum(["cash", "zelle"]),
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
  customerPhone: z.string().trim().min(7, "Enter a phone number we can reach you on.").max(30),
  deliveryAddress: z.string().trim().max(300).optional().default(""),
  deliveryNotes: z.string().trim().max(300).optional().default(""),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = offlineSchema.parse(await request.json());

    const deliveryDate = await prisma.deliveryDate.findUnique({
      where: { id: parsed.deliveryDateId },
      include: { school: { select: { restaurantId: true } } },
    });
    if (!deliveryDate) {
      return NextResponse.json({ error: "Date not found." }, { status: 400 });
    }
    const restaurantId = deliveryDate.school.restaurantId;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        isActive: true,
        acceptCash: true,
        acceptZelle: true,
        zelleHandle: true,
        offlinePaymentInstructions: true,
        deliveryEnabled: true,
      },
    });
    if (!restaurant?.isActive) {
      return NextResponse.json({ error: "This restaurant isn't taking orders right now." }, { status: 503 });
    }
    const methodAllowed =
      (parsed.paymentMethod === "cash" && restaurant.acceptCash) ||
      (parsed.paymentMethod === "zelle" && restaurant.acceptZelle);
    if (!methodAllowed) {
      return NextResponse.json({ error: "That payment method isn't available." }, { status: 400 });
    }
    if (parsed.fulfillmentType === "DELIVERY") {
      if (!restaurant.deliveryEnabled) {
        return NextResponse.json({ error: "Delivery isn't offered. Please choose pickup." }, { status: 400 });
      }
      if (parsed.deliveryAddress.length < 8) {
        return NextResponse.json({ error: "Enter your full delivery address." }, { status: 400 });
      }
    }

    const order = await createAdminOrder({
      input: parsed,
      paymentMode: { kind: "offline_pending", method: parsed.paymentMethod },
      restaurantId,
      enforceCutoff: true,
      fulfillment: {
        fulfillmentType: parsed.fulfillmentType,
        customerPhone: parsed.customerPhone,
        deliveryAddress: parsed.fulfillmentType === "DELIVERY" ? parsed.deliveryAddress : undefined,
        deliveryNotes: parsed.deliveryNotes || undefined,
      },
    });

    logInfo("offline_order_created", { orderId: order.id, restaurantId, method: parsed.paymentMethod });

    // Best-effort — never fail the order over an email problem.
    await sendOfflineOrderEmail(order.id, restaurantId);

    return NextResponse.json({
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      instructions: buildPaymentInstructionLines({
        method: parsed.paymentMethod,
        totalCents: order.totalCents,
        zelleHandle: restaurant.zelleHandle,
        instructions: restaurant.offlinePaymentInstructions,
      }),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      logWarn("offline_order_validation_failed");
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    logException(err, "offline_order_failed");
    return NextResponse.json({ error: formatApiError(err, "Unable to place your order.") }, { status: 400 });
  }
}
