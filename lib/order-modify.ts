import { createHash } from "crypto";
import { formatInTimeZone } from "date-fns-tz";
import type Stripe from "stripe";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import { createRefund } from "@/lib/payments/refund-params";
import { createOrderEditCheckoutSession } from "@/lib/payments/checkout";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";
import { logActivity } from "@/lib/activity";
import { formatCurrency } from "@/lib/utils";
import { assertOrderingOpen, findWeeklyBatchPaymentIntent, type AdminAdjustmentMode } from "@/lib/orders";
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

const STRIPE_PROVIDERS = new Set(["stripe", "stripe_checkout_link", "stripe-weekly-batch"]);

async function prepareModification(args: {
  orderId: string;
  restaurantId: string;
  request: ModifyRequest;
}) {
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
  if (order.status !== OrderStatus.PAID) throw new Error(`Order ${order.orderNumber}: only paid orders can be modified.`);
  if (order.archivedAt) throw new Error(`Order ${order.orderNumber} is archived.`);
  if (order.refundAmountCents > 0) {
    throw new Error(`Order ${order.orderNumber} already has a refund. Modifying it isn't supported — cancel and re-create instead.`);
  }
  if (order.pendingEditCheckoutSession || order.pendingEditTotalCents != null) {
    throw new Error(`Order ${order.orderNumber} has a payment link outstanding. Wait for it to be paid or cancel it before editing.`);
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

  const isStripePayment = !!order.payment && STRIPE_PROVIDERS.has(order.payment.provider);
  // Weekly-checkout orders carry no PaymentIntent of their own: the whole
  // week was one charge, found through the batch.
  const originalPi =
    order.paymentIntentId ??
    order.payment?.providerPaymentIntent ??
    (order.payment?.provider === "stripe-weekly-batch" ? await findWeeklyBatchPaymentIntent(order) : null);
  const intents = [order.deltaPaymentIntentId, originalPi].filter((v): v is string => !!v);

  return { order, plan, isStripePayment, intents };
}

function refundKey(parts: (string | number)[]) {
  return "modify-" + createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

function noteOf(adminNote: string | undefined, existing: string | null) {
  return adminNote ? `[Admin note: ${adminNote}]${existing ? `\n${existing}` : ""}` : undefined;
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
  const { order, plan, isStripePayment, intents } = await prepareModification(args);
  const { deltaCents } = plan;

  const specialInstructions = noteOf(args.adminNote, order.specialInstructions);
  const noteFragment = args.adminNote ? ` · note: "${args.adminNote.slice(0, 80)}"` : "";
  const summaryText = plan.summary.join("; ");

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
        pendingEditPayload: { plans: [{ orderId: order.id, plan, specialInstructions: specialInstructions ?? null }] } as unknown as Prisma.InputJsonValue,
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
      if (intents.length === 0) {
        throw new Error("Cannot issue refund: Stripe order is missing a payment intent. Contact support.");
      }
      const maxUpdated = Math.max(...order.items.map((i) => i.updatedAt.getTime()));
      await refundAcrossIntents({
        intents,
        amountCents: refundCents,
        keyBase: refundKey([order.id, order.totalCents, plan.newTotalCents, maxUpdated, order.items.map((i) => i.id).sort().join(",")]),
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

/**
 * Orders in the same weekly-checkout batch as `order` (including itself):
 * the week was ONE Stripe charge, so edits across these orders can be settled
 * with ONE pay link / ONE net refund.
 */
export async function findWeeklySiblingOrderIds(order: {
  id: string;
  restaurantId: string;
  parentUserId: string | null;
  parentChildId: string | null;
  deliveryDateId: string;
}): Promise<string[]> {
  if (!order.parentUserId || !order.parentChildId) return [];
  const item = await prisma.weeklyCheckoutBatchItem.findFirst({
    where: {
      deliveryDateId: order.deliveryDateId,
      parentChildId: order.parentChildId,
      weeklyCheckoutBatch: { parentUserId: order.parentUserId, status: "PAID" },
    },
    orderBy: { createdAt: "desc" },
    select: { weeklyCheckoutBatchId: true },
  });
  if (!item) return [];
  const items = await prisma.weeklyCheckoutBatchItem.findMany({
    where: { weeklyCheckoutBatchId: item.weeklyCheckoutBatchId },
    select: { deliveryDateId: true, parentChildId: true },
  });
  const orders = await prisma.order.findMany({
    where: {
      restaurantId: order.restaurantId,
      parentUserId: order.parentUserId,
      status: OrderStatus.PAID,
      archivedAt: null,
      payment: { is: { provider: "stripe-weekly-batch" } },
      OR: items.map((i) => ({ deliveryDateId: i.deliveryDateId, parentChildId: i.parentChildId })),
    },
    select: { id: true },
  });
  return orders.map((o) => o.id);
}

/**
 * Edit several orders of one weekly checkout at once and settle the money
 * ONCE: a single pay link for the net increase, or a single net refund.
 * Decreases on one day offset increases on another.
 */
export async function modifyWeeklyBatchAsAdmin(args: {
  restaurantId: string;
  adminUserId?: string;
  edits: { orderId: string; request: ModifyRequest }[];
  adminNote?: string;
  adjustmentMode?: AdminAdjustmentMode;
}): Promise<ModifyOrderResult> {
  const mode: AdminAdjustmentMode = args.adjustmentMode ?? { kind: "stripe_link" };
  if (args.edits.length === 0) throw new Error("No changes to save.");
  if (new Set(args.edits.map((e) => e.orderId)).size !== args.edits.length) throw new Error("Duplicate order in request.");

  const prepared = [];
  for (const e of args.edits) {
    prepared.push(await prepareModification({ orderId: e.orderId, restaurantId: args.restaurantId, request: e.request }));
  }
  const first = prepared[0].order;
  if (prepared.some((p) => p.order.parentUserId !== first.parentUserId || p.order.payment?.provider !== "stripe-weekly-batch")) {
    throw new Error("These orders are not from the same weekly checkout.");
  }
  const siblingIds = new Set(await findWeeklySiblingOrderIds(first));
  if (prepared.some((p) => !siblingIds.has(p.order.id))) throw new Error("These orders are not from the same weekly checkout.");

  const netDelta = prepared.reduce((t, p) => t + p.plan.deltaCents, 0);
  const newTotalSum = prepared.reduce((t, p) => t + p.plan.newTotalCents, 0);
  const intents = prepared[0].intents.filter((v, i, a) => a.indexOf(v) === i);
  const summaryText = prepared.map((p) => `${p.order.orderNumber}: ${p.plan.summary.join(", ")}`).join(" | ");
  const noteFragment = args.adminNote ? ` · note: "${args.adminNote.slice(0, 80)}"` : "";
  const withNotes = prepared.map((p) => ({
    p,
    specialInstructions: noteOf(args.adminNote, p.order.specialInstructions) ?? null,
  }));

  // ── Net increase: ONE pay link covering every order in the edit ──
  if (netDelta > 0 && mode.kind === "stripe_link") {
    const primary = prepared[0].order;
    if (prepared.some((p) => p.order.deltaPaymentIntentId)) {
      throw new Error("An order in this week was already increased through a payment link. Record the increase as manual or comped.");
    }
    const now = new Date();
    const earliestCutoff = Math.min(...prepared.map((p) => p.order.deliveryDate.cutoffAt.getTime()));
    if (earliestCutoff - now.getTime() < 30 * 60 * 1000) {
      throw new Error("Too close to cutoff for a payment link — record the increase as manual or comped instead.");
    }
    const expiresAt = Math.floor(Math.min(earliestCutoff, now.getTime() + 24 * 60 * 60 * 1000 - 60_000) / 1000);

    const session = await createOrderEditCheckoutSession({
      orderId: primary.id,
      orderNumber: primary.orderNumber,
      parentEmail: primary.parentEmail,
      deltaCents: netDelta,
      newTotalCents: primary.totalCents + prepared[0].plan.deltaCents,
      newItemsJson: JSON.stringify({ viaPayload: true }),
      stripeAccountId: primary.restaurant.stripeAccountId,
      expiresAt,
    });

    const payload = {
      plans: withNotes.map(({ p, specialInstructions }) => ({ orderId: p.order.id, plan: p.plan, specialInstructions })),
    } as unknown as Prisma.InputJsonValue;

    await prisma.$transaction([
      prisma.order.update({
        where: { id: primary.id },
        data: {
          pendingEditTotalCents: prepared[0].plan.newTotalCents,
          pendingEditCheckoutSession: session.id,
          pendingEditCreatedAt: now,
          pendingEditPayload: payload,
        },
      }),
      // Lock the other orders so nobody edits them while the link is open.
      ...prepared.slice(1).map((p) =>
        prisma.order.update({
          where: { id: p.order.id },
          data: { pendingEditTotalCents: p.plan.newTotalCents, pendingEditCreatedAt: now },
        })
      ),
    ]);

    await logActivity({
      restaurantId: primary.restaurantId,
      adminUserId: args.adminUserId,
      entityType: "ORDER",
      entityId: primary.id,
      action: "MODIFIED",
      summary: `Admin started a weekly modification across ${prepared.length} orders (${summaryText}) — awaiting one payment of ${formatCurrency(netDelta)}${noteFragment}`,
      metadata: { orderIds: prepared.map((p) => p.order.id), netDelta, adjustmentMode: "stripe_link" },
    });

    return { action: "checkout_required", checkoutUrl: session.url!, deltaCents: netDelta, newTotalCents: newTotalSum };
  }

  // ── Net decrease: ONE refund for the net amount, then apply everything ──
  let refundCents = 0;
  const isStripePayment = prepared.every((p) => p.isStripePayment);
  if (netDelta < 0) {
    refundCents = -netDelta;
    if (isStripePayment) {
      if (intents.length === 0) throw new Error("Cannot issue refund: the weekly payment intent was not found. Contact support.");
      await refundAcrossIntents({
        intents,
        amountCents: refundCents,
        keyBase: refundKey([
          ...prepared.map((p) => `${p.order.id}:${p.order.totalCents}>${p.plan.newTotalCents}`),
          Math.max(...prepared.flatMap((p) => p.order.items.map((i) => i.updatedAt.getTime()))),
        ]),
        metadata: {
          orderId: first.id,
          orderModification: "true",
          weeklyBatchEdit: "true",
          orderCount: String(prepared.length),
          adminUserId: args.adminUserId ?? "unknown",
        },
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const { p, specialInstructions } of withNotes) {
      await applyModifyPlan(tx, p.order.id, p.plan, specialInstructions ? { specialInstructions } : {});
    }
  });

  const moneyFragment =
    netDelta < 0
      ? ` (${formatCurrency(refundCents)} refunded in one refund)`
      : netDelta > 0
        ? ` (+${formatCurrency(netDelta)} ${mode.kind === "comped" ? "comped" : `recorded as ${mode.kind === "manual" ? mode.method : "manual"}`})`
        : " (no net change)";
  await logActivity({
    restaurantId: first.restaurantId,
    adminUserId: args.adminUserId,
    entityType: "ORDER",
    entityId: first.id,
    action: "MODIFIED",
    summary: `Admin modified ${prepared.length} orders in one weekly checkout (${summaryText})${moneyFragment}${noteFragment}`,
    metadata: { orderIds: prepared.map((p) => p.order.id), netDelta, refundCents },
  });

  return { action: "updated", deltaCents: netDelta, refundCents, newTotalCents: newTotalSum };
}

/** Cancels an outstanding pay link (and the locks on any sibling orders). */
export async function cancelPendingModification(args: {
  orderId: string;
  restaurantId: string;
  adminUserId?: string;
}) {
  const order = await prisma.order.findFirst({
    where: { id: args.orderId, restaurantId: args.restaurantId },
    select: { id: true, orderNumber: true, restaurantId: true, pendingEditCheckoutSession: true, pendingEditPayload: true },
  });
  if (!order) throw new Error("Order not found.");

  // A locked sibling points at the primary order that owns the link.
  let primary = order;
  if (!order.pendingEditCheckoutSession) {
    const owner = await prisma.order.findFirst({
      where: {
        restaurantId: args.restaurantId,
        pendingEditCheckoutSession: { not: null },
        pendingEditPayload: { path: ["plans"], array_contains: [{ orderId: order.id }] },
      },
      select: { id: true, orderNumber: true, restaurantId: true, pendingEditCheckoutSession: true, pendingEditPayload: true },
    });
    if (!owner) {
      // Orphaned lock marker — just clear it.
      await prisma.order.update({ where: { id: order.id }, data: { pendingEditTotalCents: null, pendingEditCreatedAt: null } });
      return;
    }
    primary = owner;
  }

  // Expire the Stripe session so a late payment can't land (best effort).
  if (stripe && primary.pendingEditCheckoutSession) {
    try {
      await stripe.checkout.sessions.expire(primary.pendingEditCheckoutSession);
    } catch {
      /* already expired/completed */
    }
  }
  const plans = ((primary.pendingEditPayload as { plans?: { orderId: string }[] } | null)?.plans ?? []).map((p) => p.orderId);
  const ids = Array.from(new Set([primary.id, ...plans]));
  await prisma.order.updateMany({
    where: { id: { in: ids }, restaurantId: args.restaurantId },
    data: { pendingEditTotalCents: null, pendingEditCheckoutSession: null, pendingEditCreatedAt: null, pendingEditPayload: Prisma.DbNull },
  });
  await logActivity({
    restaurantId: primary.restaurantId,
    adminUserId: args.adminUserId,
    entityType: "ORDER",
    entityId: primary.id,
    action: "MODIFIED",
    summary: `Admin cancelled the outstanding payment link on order ${primary.orderNumber}${ids.length > 1 ? ` (and ${ids.length - 1} linked order${ids.length > 2 ? "s" : ""})` : ""}`,
  });
}

/** Editor data for every still-editable day of the weekly checkout `order` belongs to. */
export async function loadWeekEditorData(
  order: { id: string; restaurantId: string; parentUserId: string | null; parentChildId: string | null; deliveryDateId: string },
  restaurantId: string
) {
  const ids = await findWeeklySiblingOrderIds(order);
  if (ids.length < 2) return [];
  const sibs = await prisma.order.findMany({
    where: {
      id: { in: ids },
      restaurantId,
      status: OrderStatus.PAID,
      archivedAt: null,
      refundAmountCents: 0,
      pendingEditCheckoutSession: null,
      pendingEditTotalCents: null,
      deliveryDate: { cutoffAt: { gt: new Date() } },
    },
    include: {
      school: true,
      student: true,
      deliveryDate: true,
      items: { include: { menuItem: { include: { options: { orderBy: { sortOrder: "asc" } } } } } },
    },
    orderBy: { deliveryDate: { deliveryDate: "asc" } },
  });
  if (sibs.length < 2) return [];
  const menus = await prisma.deliveryMenuItem.findMany({
    where: {
      deliveryDateId: { in: sibs.map((s) => s.deliveryDateId) },
      isAvailable: true,
      menuItem: { restaurantId, isActive: true },
    },
    include: {
      menuItem: {
        include: {
          options: { orderBy: { sortOrder: "asc" } },
          sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      },
    },
  });
  return sibs.map((s) => ({
    orderId: s.id,
    dateLabel: `${formatInTimeZone(s.deliveryDate.deliveryDate, s.school.timezone, "EEE MMM d")} · ${s.student.studentName}`,
    currentTotalCents: s.totalCents,
    discountCents: s.discountCents,
    lines: s.items.map((i) => ({
      id: i.id,
      menuItemId: i.menuItemId,
      name: i.itemNameSnapshot,
      sizeName: i.sizeName,
      basePriceCents: i.basePriceCents,
      additions: i.additions,
      removals: i.removals,
      refunded: !!i.refundedAt,
      menu: {
        id: i.menuItem.id,
        name: i.menuItem.name,
        basePriceCents: i.menuItem.basePriceCents,
        sizes: [],
        requiredChoices: i.menuItem.requiredChoices ?? [],
        addOns: i.menuItem.options.filter((o) => o.optionType === "ADD_ON").map((o) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents })),
        removals: i.menuItem.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name),
      },
    })),
    menuItems: menus
      .filter((m) => m.deliveryDateId === s.deliveryDateId)
      .map((m) => m.menuItem)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({
        id: m.id,
        name: m.name,
        basePriceCents: m.basePriceCents,
        sizes: m.sizes.map((z) => ({ name: z.name, priceCents: z.priceCents })),
        requiredChoices: m.requiredChoices ?? [],
        addOns: m.options.filter((o) => o.optionType === "ADD_ON").map((o) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents })),
        removals: m.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name),
      })),
  }));
}
