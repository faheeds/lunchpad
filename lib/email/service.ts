import { Resend } from "resend";
import { EmailStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  buildConfirmationEmail,
  buildCancellationEmail,
  buildCutoffReminderEmail,
  buildKitchenPrepEmail,
  buildWelcomeRestaurantEmail,
  buildOrderModifiedEmail,
} from "@/lib/email/templates";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendOrderConfirmationEmail(orderId: string, restaurantId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { school: true, deliveryDate: true, student: true, items: true }
  });

  if (!order) {
    throw new Error("Order not found.");
  }
  const message = buildConfirmationEmail({
    parentName: order.parentName,
    studentName: order.student.studentName,
    deliveryDate: order.deliveryDate.deliveryDate,
    timezone: order.school.timezone,
    items: order.items.map((item) => ({
      itemName: item.itemNameSnapshot,
      additions: item.additions,
      removals: item.removals
    })),
    allergyNotes: order.items.map((item) => item.allergyNotes).find(Boolean) ?? order.student.allergyNotes,
    amountCents: order.totalCents,
    orderNumber: order.orderNumber
  });

  try {
    let providerId: string | undefined;

    if (resend && env.EMAIL_FROM) {
      const result = await resend.emails.send({
        from: env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
        to: order.parentEmail,
        subject: message.subject,
        text: message.text,
        html: message.html
      });
      if (result.error) {
        throw new Error(result.error.message || "Resend email delivery failed.");
      }
      providerId = result.data?.id;
    } else {
      throw new Error("Email delivery is not configured. Add a valid RESEND_API_KEY and EMAIL_FROM.");
    }

    await prisma.$transaction([
      prisma.emailLog.create({
        data: {
          orderId: order.id,
          emailType: "ORDER_CONFIRMATION",
          recipient: order.parentEmail,
          providerId,
          status: EmailStatus.SENT,
          sentAt: new Date()
        }
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          confirmationSentAt: new Date()
        }
      })
    ]);

    return { ok: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown email error";
    await prisma.emailLog.create({
      data: {
        orderId: order.id,
        emailType: "ORDER_CONFIRMATION",
        recipient: order.parentEmail,
        status: EmailStatus.FAILED,
        errorMessage: messageText
      }
    });
    throw error;
  }
}

export async function sendCancellationEmail(orderId: string, restaurantId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { school: true, deliveryDate: true, student: true, items: true },
  });

  if (!order) throw new Error("Order not found.");

  const message = buildCancellationEmail({
    parentName: order.parentName,
    studentName: order.student.studentName,
    deliveryDate: order.deliveryDate.deliveryDate,
    timezone: order.school.timezone,
    items: order.items.map((i) => ({ itemName: i.itemNameSnapshot })),
    amountCents: order.totalCents,
    orderNumber: order.orderNumber,
  });

  try {
    let providerId: string | undefined;

    if (resend && env.EMAIL_FROM) {
      const result = await resend.emails.send({
        from: env.EMAIL_FROM_NAME
          ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`
          : env.EMAIL_FROM,
        to: order.parentEmail,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (result.error) throw new Error(result.error.message || "Resend email delivery failed.");
      providerId = result.data?.id;
    } else {
      throw new Error("Email delivery is not configured.");
    }

    await prisma.emailLog.create({
      data: {
        orderId: order.id,
        emailType: "ORDER_CANCELLATION",
        recipient: order.parentEmail,
        providerId,
        status: EmailStatus.SENT,
        sentAt: new Date(),
      },
    });

    return { ok: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown email error";
    await prisma.emailLog.create({
      data: {
        orderId: order.id,
        emailType: "ORDER_CANCELLATION",
        recipient: order.parentEmail,
        status: EmailStatus.FAILED,
        errorMessage: messageText,
      },
    });
    throw error;
  }
}

export async function scheduleCutoffReminderEmail(orderId: string, restaurantId: string) {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { school: true, deliveryDate: true, student: true },
    });

    if (!order || !resend || !env.EMAIL_FROM) return;

    const cutoffAt = order.deliveryDate.cutoffAt;
    const now = new Date();
    if (now >= cutoffAt) return;

    const reminderAt = new Date(cutoffAt.getTime() - 24 * 60 * 60 * 1000);
    const sendAt = reminderAt > now ? reminderAt : null;

    const message = buildCutoffReminderEmail({
      parentName: order.parentName,
      studentName: order.student.studentName,
      deliveryDate: order.deliveryDate.deliveryDate,
      cutoffAt,
      timezone: order.school.timezone,
      orderUrl: `${env.APP_BASE_URL}/order`,
      schoolName: order.school.name,
    });

    await resend.emails.send({
      from: env.EMAIL_FROM_NAME
        ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`
        : env.EMAIL_FROM,
      to: order.parentEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(sendAt ? { scheduledAt: sendAt.toISOString() } : {}),
    });
  } catch {
    // Best-effort - never blocks the calling flow.
  }
}

// ─── Kitchen prep summary ─────────────────────────────────────────────────────

/**
 * Sends the kitchen prep sheet for a delivery date to the restaurant's
 * contact email. Safe to call from an API route or a scheduled job.
 */
export async function sendKitchenPrepEmail(deliveryDateId: string) {
  const deliveryDate = await prisma.deliveryDate.findUnique({
    where: { id: deliveryDateId },
    include: {
      school: { include: { restaurant: true } },
      orders: {
        where: { status: "PAID", archivedAt: null },
        include: {
          student: true,
          items: { orderBy: { itemNameSnapshot: "asc" } },
        },
        orderBy: [{ student: { studentName: "asc" } }],
      },
    },
  });

  if (!deliveryDate) throw new Error("Delivery date not found.");

  const restaurant = deliveryDate.school.restaurant;
  const to = restaurant.contactEmail;
  if (!to) throw new Error("Restaurant has no contact email configured.");

  if (!resend || !env.EMAIL_FROM) {
    throw new Error("Email delivery is not configured.");
  }

  // Build item groups: { itemName → orders[] }
  type OrderWithItems = (typeof deliveryDate.orders)[0];
  type ItemEntry = OrderWithItems["items"][0] & { order: OrderWithItems };
  const groupMap = new Map<string, ItemEntry[]>();
  for (const order of deliveryDate.orders) {
    for (const item of order.items) {
      const key = item.itemNameSnapshot;
      if (!groupMap.has(key)) groupMap.set(key, [] as ItemEntry[]);
      groupMap.get(key)!.push({ ...item, order });
    }
  }

  const itemGroups = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemName, items]) => ({
      itemName,
      orders: items.map((i) => ({
        studentName: i.order.student.studentName,
        grade: i.order.student.grade,
        additions: i.additions,
        removals: i.removals,
        allergyNotes: i.allergyNotes ?? i.order.student.allergyNotes ?? null,
        specialInstructions: i.specialInstructions ?? null,
      })),
    }));

  const message = buildKitchenPrepEmail({
    restaurantName: restaurant.name,
    schoolName: deliveryDate.school.name,
    deliveryDate: deliveryDate.deliveryDate,
    timezone: deliveryDate.school.timezone,
    itemGroups,
    totalOrders: deliveryDate.orders.length,
  });

  const result = await resend.emails.send({
    from: env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (result.error) throw new Error(result.error.message || "Resend failed.");
  return { ok: true, ordersCount: deliveryDate.orders.length };
}

// ─── Order modified by admin ──────────────────────────────────────────────────

/**
 * Sends an "order updated" email to the parent after an admin modifies their order.
 * Best-effort — caller should `.catch(() => {})` so a mail failure never blocks saves.
 */
export async function sendOrderModifiedEmail(orderId: string, restaurantId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { school: true, deliveryDate: true, student: true, items: true },
  });

  if (!order) throw new Error("Order not found.");
  if (!resend || !env.EMAIL_FROM) throw new Error("Email delivery is not configured.");

  // Extract admin note from the special instructions prefix if present
  const adminNoteMatch = order.items[0]?.specialInstructions?.match(/^\[Admin note:([\s\S]*?)\]/);
  const adminNote = adminNoteMatch ? adminNoteMatch[1].trim() : null;

  const message = buildOrderModifiedEmail({
    parentName: order.parentName,
    studentName: order.student.studentName,
    deliveryDate: order.deliveryDate.deliveryDate,
    timezone: order.school.timezone,
    orderNumber: order.orderNumber,
    items: order.items.map((item) => ({
      itemName: item.itemNameSnapshot,
      additions: item.additions,
      removals: item.removals,
    })),
    allergyNotes: order.items.map((i) => i.allergyNotes).find(Boolean) ?? order.student.allergyNotes,
    amountCents: order.totalCents,
    adminNote,
  });

  const result = await resend.emails.send({
    from: env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
    to: order.parentEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (result.error) throw new Error(result.error.message || "Resend email delivery failed.");

  await prisma.emailLog.create({
    data: {
      orderId: order.id,
      emailType: "ORDER_MODIFIED",
      recipient: order.parentEmail,
      providerId: result.data?.id,
      status: EmailStatus.SENT,
      sentAt: new Date(),
    },
  });

  return { ok: true };
}

// ─── Welcome email (restaurant signup) ───────────────────────────────────────

/**
 * Sends a welcome email to a newly created restaurant's owner.
 * Best-effort — never throws; logs errors to console only.
 */
export async function sendWelcomeRestaurantEmail(restaurantId: string) {
  try {
    if (!resend || !env.EMAIL_FROM) return;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { admins: { where: { role: "OWNER" }, take: 1 } },
    });
    if (!restaurant?.contactEmail) return;

    const owner = restaurant.admins[0];
    const ownerName = owner?.name ?? "there";
    const orderingUrl = `https://${restaurant.slug}.${env.ROOT_DOMAIN}`;
    const setupUrl = `https://${restaurant.slug}.${env.ROOT_DOMAIN}/admin/setup`;

    const message = buildWelcomeRestaurantEmail({
      ownerName,
      restaurantName: restaurant.name,
      slug: restaurant.slug,
      setupUrl,
      orderingUrl,
    });

    await resend.emails.send({
      from: env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
      to: restaurant.contactEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (err) {
    console.error("[welcome-email] failed:", err);
  }
}

// ─── Subscription plan change ────────────────────────────────────────────────
import { buildSubscriptionChangedEmail } from "@/lib/email/templates";
import { stripe } from "@/lib/payments/stripe";

const PLAN_LABELS: Record<string, string> = {
  STARTER: "Starter ($49/mo)",
  GROWTH:  "Growth ($149/mo)",
  SCALE:   "Scale ($349/mo)",
};

const PLAN_PRICE_LABELS: Record<string, string> = {
  STARTER: "$49/mo",
  GROWTH:  "$149/mo",
  SCALE:   "$349/mo",
};

/**
 * Sends a confirmation email to the restaurant owner when a subscription
 * plan changes (upgrade/downgrade). Includes proration details from Stripe.
 * Best-effort — never throws; logs errors to console only.
 */
export async function sendSubscriptionChangedEmail(
  restaurantId: string,
  oldPlan: string,
  newPlan: string,
) {
  try {
    if (!resend || !env.EMAIL_FROM) return;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { admins: { where: { role: "OWNER" }, take: 1 } },
    });
    if (!restaurant?.contactEmail) return;

    const owner = restaurant.admins[0];
    const ownerName = owner?.name ?? "there";

    // Pull proration details from Stripe's upcoming invoice — gives us exact
    // prorated charge / credit amounts and next-invoice total.
    let prorationCents = 0;
    let nextInvoiceTotalCents: number | null = null;
    let nextInvoiceDate: Date | null = null;
    if (stripe && restaurant.stripeSubscriptionId) {
      try {
        const upcoming = await stripe.invoices.retrieveUpcoming({
          subscription: restaurant.stripeSubscriptionId,
        });
        // Sum the proration line items (positive = charge, negative = credit)
        for (const line of upcoming.lines.data) {
          if (line.proration) prorationCents += line.amount;
        }
        nextInvoiceTotalCents = upcoming.total;
        if (upcoming.next_payment_attempt) {
          nextInvoiceDate = new Date(upcoming.next_payment_attempt * 1000);
        } else if (upcoming.period_end) {
          nextInvoiceDate = new Date(upcoming.period_end * 1000);
        }
      } catch {
        // Stripe upcoming-invoice fetch can fail if there's no upcoming invoice
        // yet (e.g., if billing cycle just rolled). Email goes out without
        // proration details rather than blocking on it.
      }
    }

    const message = buildSubscriptionChangedEmail({
      ownerName,
      restaurantName: restaurant.name,
      oldPlan: PLAN_LABELS[oldPlan] ?? oldPlan,
      newPlan: PLAN_LABELS[newPlan] ?? newPlan,
      newPriceLabel: PLAN_PRICE_LABELS[newPlan] ?? "",
      prorationCents,
      nextInvoiceDate,
      nextInvoiceTotalCents,
    });

    await resend.emails.send({
      from: env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
      to: restaurant.contactEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (err) {
    console.error("[subscription-changed-email] failed:", err);
  }
}
