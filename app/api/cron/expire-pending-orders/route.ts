import { NextRequest, NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { settlePendingOrder } from "@/lib/pending-orders";

export const runtime = "nodejs";

/**
 * Backstop for the checkout.session.expired webhook. Resolves PENDING orders
 * older than 45 minutes against Stripe: paid ones are healed to PAID (missed
 * webhook), expired/abandoned ones are cancelled and their discount released.
 * Admin payment-link orders are skipped; they legitimately stay open for 24h.
 */
export async function GET(request: NextRequest) {
  if (env.CRON_SECRET) {
    const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
    if (scheme !== "Bearer" || token !== env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - 45 * 60 * 1000);
  const stale = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING,
      createdAt: { lt: cutoff },
      payment: { is: { provider: { not: "stripe_checkout_link" } } },
    },
    select: { id: true, checkoutSessionId: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const counts = { paid: 0, cancelled: 0, still_open: 0, unknown: 0 };
  for (const order of stale) {
    counts[await settlePendingOrder(order, { notify: true })]++;
  }
  return NextResponse.json({ checked: stale.length, ...counts });
}
