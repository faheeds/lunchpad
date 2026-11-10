import { createHash } from "crypto";
import type Stripe from "stripe";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { createRefund } from "@/lib/payments/refund-params";
import { createOrderEditCheckoutSession } from "@/lib/payments/checkout";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { logActivity } from "@/lib/activity";
import { formatCurrency } from "@/lib/utils";
import { assertOrderingOpen, type AdminAdjustmentMode } from "@/lib/orders";
import {
  planOrderModification,
  type ExistingLine,
  type MenuLite,
  type ModifyPlan,
  type ModifyRequest,
} from "@/lib/order-modify-plan";

export type { ModifyRequest, ModifyPlan } from "@/lib/order-modify-plan";

type MenuItemWithOptions = Prisma.MenuItemGetPayload<{ include: { options: true; sizes: true } }>;

function toMenuLite(m: MenuItemWithOptions): MenuLite {
  return {
    id: m.id,
    name: m.name,
    basePriceCents: m.basePriceCents,
    sizes: m.sizes.map((s) => ({ name: s.name, priceCents: s.priceCents })),
    requiredChoices: getRequiredChoicesForMenuItem(m),
    options: m.options.map((o) => ({
      name: o.name,
      optionType: o.optionType as "ADD_ON" | "REMOVAL",
      priceDeltaCents: o.priceDeltaCents,
    })),
  };
}

export type ModifyOrderResult =
  | { action: "updated"; deltaCents: number; refundCents: number; newTotalCents: number; recordedAs?: string }
  | {
      action: "checkout_required";
      checkoutUrl: string;
      deltaCents: number;
      newTotalCents: number;
    };

/** Applies a plan inside an existing transaction. Shared by the admin action
 *  (immediate paths) and the Stripe webhook (after the pay link is paid). */
export async function applyModifyPlan(
  tx: Prisma.TransactionClient,
  orderId: string,
  plan: ModifyPlan,
  extraOrderData: Prisma.OrderUpdateInput = {}
) {
  if (plan.removeIds.length) {
    await tx.orderItem.deleteMany({ where: { orderId, id: { in: plan.removeIds } } });
  }
  for (const u of plan.updates) {
    await tx.orderItem.update({
      where: { id: u.id },
      data: { additions: u.additions, removals: u.removals, lineTotalCents: u.lineTotalCents },
    });
  }
  if (plan.creates.length) {
    await tx.orderItem.createMany({
      data: plan.creates.map((c) => ({
        orderId,
        menuItemId: c.menuItemId,
        itemNameSnapshot: c.itemNameSnapshot,
        basePriceCents: c.basePriceCents,
        sizeName: c.sizeName,
        additions: c.additions,
        removals: c.removals,
        lineTotalCents: c.lineTotalCents,
      })),
    });
  }
  await tx.order.update({
    where: { id: orderId },
    data: {
      subtotalCents: plan.newSubtotalCents,
      totalCents: plan.newTotalCents,
      ...extraOrderData,
    },
  });
  await tx.payment.updateMany({ where: { orderId }, data: { amountCents: plan.newTotalCents } });
}

/**
 * Refunds `amountCents` drawing first from the supplemental (edit) charge,
 * then from the original charge, never exceeding what each still holds.
 */
export async function refundAcrossIntents(args: {
  intents: string[];
  amountCents: number;
  keyBase: string;
  metadata: Record<string, string>;
}) {
  if (!stripe) throw new Error("Stripe is not configured — cannot issue the refund.");
  let need = args.amountCents;
  for (const pi of args.intents) {
    if (need <= 0) break;
    const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
    const charge = intent.latest_charge as Stripe.Charge | null;
    const remaining = charge ? charge.amount_captured - charge.amount_refunded : 0;
    const take = Math.min(remaining, need);
    if (take > 0) {
      await createRefund(
        { payment_intent: pi, amount: take, metadata: args.metadata },
        { idempotencyKey: `${args.keyBase}-${pi}-${take}` }
      );
      need -= take;
    }
  }
  if (need > 0) {
    throw new Error(
      `Could not refund the full ${formatCurrency(args.amountCents)}: ${formatCurrency(need)} is more than the charges still hold.`
    );
  }
}

export async function modifyOrderLinesAsAdmin(args: {
  orderId: string;
  /** REQUIRED — multi-tenant scoping. */
  restaurantId: string;
  adminUserId?: string;
  request: ModifyRequest;
  adminNote?: string;
  /** How a price INCREASE on a Stripe-paid order is handled. */
  adjustmentMode?: AdminAdjustmentMode;
}): Promise<ModifyOrderResult> {
  const mode: AdminAdjustmentMode = args.adjustmentMode ?? { kind: "stripe_link" };

  const order = await prisma.order.findFirst({
    where: { id: args.orderId, restaurantId: args.restaurantId },
    include: {
      school: true,
      deliveryDate: true,
      payment: true,
      restaurant: { select: { stripeAccountId: true } },
      items: { include: { menuItem: { include: { options: true, sizes: true } } } },
    },
  });
  if (!order) throw new Error("Order not found.");
  if (order.status !== OrderStatus.PAID) throw new Error("Only paid orders can be modified.");
  if (order.archivedAt) throw new Error("This order is archived.");
  if (order.refundAmountCents > 0) {
    throw new Error("This order already has a refund. Modifying it isn't supported — cancel and re-create instead.");
  }
  if (order.pendingEditCheckoutSession) {
    throw new Error("This order has a payment link outstanding. Wait for it to be paid or expire before editing.");
  }
  assertOrderingOpen(new Date(), order.deliveryDate.cutoffAt, order.deliveryDate.deliveryDate, order.school.timezone);

  const availability = await prisma.deliveryMenuItem.findMany({
    where: {
      deliveryDateId: order.deliveryDateId,
      isAvailable: true,
      menuItem: { restaurantId: args.restaurantId, isActive: true },
    },
    include: { menuItem: { include: { options: true, sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } },
  });
  const available = new Map(availability.map((a) => [a.menuItemId, toMenuLite(a.menuItem)]));

  // Per-item caps: don't let an admin oversell a capped item.
  for (const add of args.request.adds) {
    const entry = availability.find((a) => a.menuItemId === add.menuItemId);
    if (entry?.maxQuantity != null) {
      const sold = await prisma.orderItem.count({
        where: {
          menuItemId: add.menuItemId,
          order: { deliveryDateId: order.deliveryDateId, status: OrderStatus.PAID, archivedAt: null },
        },
      });
      if (sold + Math.floor(add.quantity) > entry.maxQuantity) {
        throw new Error(`Not enough left of ${entry.menuItem.name} (cap ${entry.maxQuantity}).`);
      }
    }
  }

  const lines: ExistingLine[] = order.items.map((i) => ({
    id: i.id,
    menuItemId: i.menuItemId,
    itemNameSnapshot: i.itemNameSnapshot,
    basePriceCents: i.basePriceCents,
    sizeName: i.sizeName,
    additions: i.additions,
    removals: i.removals,
    lineTotalCents: i.lineTotalCents,
    refunded: !!i.refundedAt,
    menu: toMenuLite(i.menuItem),
  }));

  const plan = planOrderModification({
    lines,
    available,
    request: args.request,
    currentSubtotalCents: order.subtotalCents,
    currentTotalCents: order.totalCents,
    discountCents: order.discountCents,
  });
  const { deltaCents } = plan;

  const specialInstructions = args.adminNote
    ? `[Admin note: ${args.adminNote}]${order.specialInstructions ? `\n${order.specialInstructions}` : ""}`
    : undefined;
  const noteFragment = args.adminNote ? ` · note: "${args.adminNote.slice(0, 80)}"` : "";
  const summaryText = plan.summary.join("; ");

  const isStripePayment = order.payment?.provider === "stripe" || order.payment?.provider === "stripe_checkout_link";
  const originalPi = order.paymentIntentId ?? order.payment?.providerPaymentIntent ?? null;

  // ── Increase on a Stripe order, settled by pay link: nothing changes until paid ──
  if (deltaCents > 0 && isStripePayment && mode.kind === "stripe_link") {
    if (order.deltaPaymentIntentId) {
      throw new Error(
        "This order was already increased once through a payment link. Record further increases as manual or comped, or create a new order."
      );
    }
    const now = new Date();
    const cutoffAt = order.deliveryDate.cutoffAt;
    if (cutoffAt.getTime() - now.getTime() < 30 * 60 * 1000) {
      throw new Error("Too close to cutoff for a payment link — record the increase as manual or comped instead.");
    }
    const expiresAt = Math.floor(Math.min(cutoffAt.getTime(), now.getTime() + 24 * 60 * 60 * 1000 - 60_000) / 1000);

    const session = await createOrderEditCheckoutSession({
      orderId: order.id,
      orderNumber: order.orderNumber,
      parentEmail: order.parentEmail,
      deltaCents,
      newTotalCents: plan.newTotalCents,
      // Full plan lives in Order.pendingEditPayload (Stripe metadata caps at 500 chars).
      newItemsJson: JSON.stringify({ viaPayload: true }),
      stripeAccountId: order.restaurant.stripeAccountId,
      expiresAt,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        pendingEditTotalCents: plan.newTotalCents,
        pendingEditCheckoutSession: session.id,
        pendingEditCreatedAt: now,
        pendingEditPayload: { plan, specialInstructions: specialInstructions ?? null } as unknown as Prisma.InputJsonValue,
      },
    });

    await logActivity({
      restaurantId: order.restaurantId,
      adminUserId: args.adminUserId,
      entityType: "ORDER",
      entityId: order.id,
      action: "MODIFIED",
      summary: `Admin started modification of order ${order.orderNumber} (${summaryText}) — awaiting payment of ${formatCurrency(deltaCents)}${noteFragment}`,
      metadata: { orderNumber: order.orderNumber, deltaCents, newTotalCents: plan.newTotalCents, adjustmentMode: "stripe_link" },
    });

    return { action: "checkout_required", checkoutUrl: session.url!, deltaCents, newTotalCents: plan.newTotalCents };
  }

  // ── Decrease on a Stripe order: refund first, then apply ──
  let refundCents = 0;
  if (deltaCents < 0) {
    refundCents = -deltaCents;
    if (isStripePayment) {
      const intents = [order.deltaPaymentIntentId, originalPi].filter((v): v is string => !!v);
      if (intents.length === 0) {
        throw new Error("Cannot issue refund: Stripe order is missing a payment intent. Contact support.");
      }
      const maxUpdated = Math.max(...order.items.map((i) => i.updatedAt.getTime()));
      const keyBase =
        "modify-" +
        createHash("sha1")
          .update([order.id, order.totalCents, plan.newTotalCents, maxUpdated, order.items.map((i) => i.id).sort().join(",")].join("|"))
          .digest("hex")
          .slice(0, 24);
      await refundAcrossIntents({
        intents,
        amountCents: refundCents,
        keyBase,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderModification: "true",
          newTotalCents: String(plan.newTotalCents),
          adminUserId: args.adminUserId ?? "unknown",
        },
      });
    }
    // Manual/comped payments: nothing to refund via Stripe; the admin settles offline.
  }

  // ── Apply (decrease after refund, manual/comped increase, or same price) ──
  await prisma.$transaction(async (tx) => {
    await applyModifyPlan(tx, order.id, plan, specialInstructions ? { specialInstructions } : {});
  });

  let recordedAs: string | undefined;
  if (deltaCents > 0) {
    recordedAs = !isStripePayment
      ? "added to amount due (non-Stripe order)"
      : mode.kind === "comped"
        ? `comped${mode.reason ? `: ${mode.reason}` : ""}`
        : `recorded as ${mode.kind === "manual" ? mode.method : "manual"}`;
  }
  const moneyFragment =
    deltaCents < 0
      ? ` (${formatCurrency(refundCents)} ${isStripePayment ? "refunded" : "owed back — settle offline"})`
      : deltaCents > 0
        ? ` (+${formatCurrency(deltaCents)} ${recordedAs})`
        : "";

  await logActivity({
    restaurantId: order.restaurantId,
    adminUserId: args.adminUserId,
    entityType: "ORDER",
    entityId: order.id,
    action: "MODIFIED",
    summary: `Admin modified order ${order.orderNumber}: ${summaryText} — total ${formatCurrency(plan.newTotalCents)}${moneyFragment}${noteFragment}`,
    metadata: {
      orderNumber: order.orderNumber,
      newTotalCents: plan.newTotalCents,
      deltaCents,
      refundCents,
      changes: plan.summary,
      adminNote: args.adminNote ?? null,
    },
  });

  return { action: "updated", deltaCents, refundCents, newTotalCents: plan.newTotalCents, recordedAs };
}

/** Cancels an outstanding pay link so the order can be edited again. */
export async function cancelPendingModification(args: {
  orderId: string;
  restaurantId: string;
  adminUserId?: string;
}) {
  const order = await prisma.order.findFirst({
    where: { id: args.orderId, restaurantId: args.restaurantId },
    select: { id: true, orderNumber: true, restaurantId: true, pendingEditCheckoutSession: true },
  });
  if (!order) throw new Error("Order not found.");
  if (!order.pendingEditCheckoutSession) throw new Error("This order has no payment link outstanding.");

  // Expire the Stripe session so a late payment can't land (best effort: an
  // already-expired or completed session just errors and we carry on).
  if (stripe) {
    try {
      await stripe.checkout.sessions.expire(order.pendingEditCheckoutSession);
    } catch {
      /* already expired/completed */
    }
  }
  await prisma.order.update({
    where: { id: order.id },
    data: {
      pendingEditTotalCents: null,
      pendingEditCheckoutSession: null,
      pendingEditCreatedAt: null,
      pendingEditPayload: Prisma.DbNull,
    },
  });
  await logActivity({
    restaurantId: order.restaurantId,
    adminUserId: args.adminUserId,
    entityType: "ORDER",
    entityId: order.id,
    action: "MODIFIED",
    summary: `Admin cancelled the outstanding payment link on order ${order.orderNumber}`,
  });
}
