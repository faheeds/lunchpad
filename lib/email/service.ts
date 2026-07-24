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
  buildRefundEmail,
  buildWeeklyConfirmationEmail,
  buildWeeklyPlanCutoffReminderEmail,
} from "@/lib/email/templates";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendOrderConfirmationEmail(orderId: string, restaurantId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { school: true, deliveryDate: true, student: true, items: true, restaurant: true }
  });

  if (!order) {
    throw new Error("Order not found.");
  }
  const guestCancelUrl = `https://${order.restaurant.slug}.${env.ROOT_DOMAIN}/checkout/success?order=${order.id}`;
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
    orderNumber: order.orderNumber,
    restaurantName: order.restaurant.name,
    restaurantLogoUrl: order.restaurant.logoUrl,
    restaurantPrimaryColor: order.restaurant.primaryColor,
    restaurantContactEmail: order.restaurant.contactEmail,
    restaurantContactPhone: order.restaurant.contactPhone,
    guestCancelUrl,
  });

  try {
    let providerId: string | undefined;

    if (resend && env.EMAIL_FROM) {
      // Use the restaurant's name as the From display so the email reads as
      // coming from the restaurant, not the platform. The actual address has
      // to stay on the verified domain (support@lunchpad.us). Reply-To points
      // at the restaurant's contact email so customer replies route correctly.
      const fromAddress = `${order.restaurant.name} <${env.EMAIL_FROM}>`;
      const result = await resend.emails.send({
        from: fromAddress,
        to: order.parentEmail,
        replyTo: order.restaurant.contactEmail || undefined,
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
    include: { school: true, deliveryDate: true, student: true, items: true, restaurant: true },
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
    restaurantName: order.restaurant.name,
    restaurantLogoUrl: order.restaurant.logoUrl,
    restaurantPrimaryColor: order.restaurant.primaryColor,
    restaurantContactEmail: order.restaurant.contactEmail,
    restaurantContactPhone: order.restaurant.contactPhone,
  });

  try {
    let providerId: string | undefined;

    if (resend && env.EMAIL_FROM) {
      const fromAddress = `${order.restaurant.name} <${env.EMAIL_FROM}>`;
      const result = await resend.emails.send({
        from: fromAddress,
        to: order.parentEmail,
        replyTo: order.restaurant.contactEmail || undefined,
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
    include: { school: true, deliveryDate: true, student: true, items: true, restaurant: true },
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

  const fromAddress = `${order.restaurant.name} <${env.EMAIL_FROM}>`;
  const result = await resend.emails.send({
    from: fromAddress,
    to: order.parentEmail,
    replyTo: order.restaurant.contactEmail || undefined,
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

export async function sendRefundEmail(
  orderId: string,
  restaurantId: string,
  refundAmountCents: number,
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { school: true, deliveryDate: true, student: true, items: true, restaurant: true },
  });

  if (!order) throw new Error("Order not found.");

  const message = buildRefundEmail({
    parentName: order.parentName,
    studentName: order.student.studentName,
    deliveryDate: order.deliveryDate.deliveryDate,
    timezone: order.school.timezone,
    items: order.items.map((i) => ({ itemName: i.itemNameSnapshot })),
    amountCents: refundAmountCents,
    orderNumber: order.orderNumber,
    restaurantName: order.restaurant.name,
    restaurantLogoUrl: order.restaurant.logoUrl,
    restaurantPrimaryColor: order.restaurant.primaryColor,
    restaurantContactEmail: order.restaurant.contactEmail,
    restaurantContactPhone: order.restaurant.contactPhone,
  });

  try {
    let providerId: string | undefined;

    if (resend && env.EMAIL_FROM) {
      const fromAddress = `${order.restaurant.name} <${env.EMAIL_FROM}>`;
      const result = await resend.emails.send({
        from: fromAddress,
        to: order.parentEmail,
        replyTo: order.restaurant.contactEmail || undefined,
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
        emailType: "ORDER_REFUND",
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
        emailType: "ORDER_REFUND",
        recipient: order.parentEmail,
        status: EmailStatus.FAILED,
        errorMessage: messageText,
      },
    });
    throw error;
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
        // Stripe SDK v18 renamed `invoices.retrieveUpcoming` → `invoices.createPreview`.
        const upcoming = await stripe.invoices.createPreview({
          subscription: restaurant.stripeSubscriptionId,
        });
        // For a plan switch the upcoming invoice is mostly proration line items
        // (a credit for unused time on the old plan + a charge for remaining time
        // on the new plan). Sum them to get the net proration.
        // (Stripe v18 moved the per-line `proration` flag, so we sum all lines.)
        for (const line of upcoming.lines.data) {
          prorationCents += line.amount;
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

// ─── Admin team invite ───────────────────────────────────────────────────────
import { buildAdminInviteEmail } from "@/lib/email/templates";

/**
 * Sends a magic-link invitation email so a new teammate can join an admin
 * team without the inviter setting their password. Caller is responsible
 * for generating the raw token and persisting its hash; this function just
 * formats and sends. Throws when delivery is misconfigured so the inviter
 * sees a clear error rather than a silent drop.
 */
export async function sendAdminInviteEmail(args: {
  toEmail: string;
  inviterName: string;
  restaurantName: string;
  roleLabel: string;
  acceptUrl: string;
  expiresInDays: number;
}) {
  if (!resend || !env.EMAIL_FROM) {
    throw new Error("Email delivery is not configured. Add a valid RESEND_API_KEY and EMAIL_FROM.");
  }

  const message = buildAdminInviteEmail({
    inviterName: args.inviterName,
    restaurantName: args.restaurantName,
    roleLabel: args.roleLabel,
    acceptUrl: args.acceptUrl,
    expiresInDays: args.expiresInDays,
  });

  // Send from the restaurant's display name so the recipient sees who they're
  // joining, not a generic platform sender.
  const fromAddress = `${args.restaurantName} <${env.EMAIL_FROM}>`;

  await resend.emails.send({
    from: fromAddress,
    to: args.toEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

// ─── Admin password reset ────────────────────────────────────────────────────
import { buildAdminPasswordResetEmail } from "@/lib/email/templates";

/**
 * Sends a password reset link to an admin user. Caller is responsible for
 * generating the raw token and persisting its hash — this function just
 * formats and sends the email. Throws when delivery is misconfigured so the
 * caller can surface a clear error to the operator.
 */
export async function sendAdminPasswordResetEmail(args: {
  toEmail: string;
  adminName: string;
  restaurantName: string;
  resetUrl: string;
  expiresInMinutes: number;
}) {
  if (!resend || !env.EMAIL_FROM) {
    throw new Error("Email delivery is not configured. Add a valid RESEND_API_KEY and EMAIL_FROM.");
  }

  const message = buildAdminPasswordResetEmail({
    adminName: args.adminName,
    restaurantName: args.restaurantName,
    resetUrl: args.resetUrl,
    expiresInMinutes: args.expiresInMinutes,
  });

  // Send from the restaurant's display name so the email reads as coming
  // from their tenant (consistent with the customer-facing emails).
  const fromAddress = `${args.restaurantName} <${env.EMAIL_FROM}>`;

  await resend.emails.send({
    from: fromAddress,
    to: args.toEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

/**
 * Sends a cutoff reminder email to a weekly plan holder who hasn't yet ordered
 * for an upcoming delivery date. Reuses existing template styling.
 * Best-effort — catches errors but doesn't throw so one recipient failure
 * doesn't block the rest of the cron run.
 */
export async function sendWeeklyPlanCutoffReminderEmail(args: {
  parentEmail: string;
  parentName: string;
  childName: string;
  deliveryDate: Date;
  cutoffAt: Date;
  timezone: string;
  schoolName: string;
  items: { itemName: string; choice?: string }[];
  orderUrl: string;
  restaurantName: string;
}) {
  if (!resend || !env.EMAIL_FROM) {
    throw new Error("Email delivery is not configured.");
  }

  const message = buildWeeklyPlanCutoffReminderEmail({
    parentName: args.parentName,
    childName: args.childName,
    deliveryDate: args.deliveryDate,
    cutoffAt: args.cutoffAt,
    timezone: args.timezone,
    schoolName: args.schoolName,
    items: args.items,
    orderUrl: args.orderUrl,
  });

  const fromAddress = `${args.restaurantName} <${env.EMAIL_FROM}>`;
  const result = await resend.emails.send({
    from: fromAddress,
    to: args.parentEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (result.error) {
    throw new Error(result.error.message || "Resend email delivery failed.");
  }

  return { ok: true, providerId: result.data?.id };
}

/**
 * Sends ONE combined confirmation email for a whole weekly checkout batch.
 *
 * A weekly batch becomes several Order rows (one per delivery date). The
 * old flow emailed each order separately, so a 4-day weekly checkout sent
 * the parent 4 emails. This loads every order created by the batch,
 * renders a single multi-day summary, sends one email, and still logs +
 * stamps each order so the admin order list and "resend" tooling stay
 * consistent.
 */
export async function sendWeeklyOrderConfirmationEmail(
  orderIds: string[],
  restaurantId: string
) {
  if (orderIds.length === 0) {
    return { ok: true, skipped: true };
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds }, restaurantId },
    include: { school: true, deliveryDate: true, student: true, items: true, restaurant: true },
  });

  if (orders.length === 0) {
    throw new Error("No orders found for weekly confirmation email.");
  }

  const restaurant = orders[0].restaurant;
  const parentEmail = orders[0].parentEmail;
  const parentName = orders[0].parentName;

  const message = buildWeeklyConfirmationEmail({
    parentName,
    restaurantName: restaurant.name,
    restaurantLogoUrl: restaurant.logoUrl,
    restaurantPrimaryColor: restaurant.primaryColor,
    restaurantContactEmail: restaurant.contactEmail,
    restaurantContactPhone: restaurant.contactPhone,
    days: orders.map((order) => ({
      deliveryDate: order.deliveryDate.deliveryDate,
      timezone: order.school.timezone,
      studentName: order.student.studentName,
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        itemName: item.itemNameSnapshot,
        additions: item.additions,
        removals: item.removals,
      })),
      allergyNotes:
        order.items.map((item) => item.allergyNotes).find(Boolean) ??
        order.student.allergyNotes,
      amountCents: order.totalCents,
    })),
    totalCents: orders.reduce((sum, o) => sum + o.totalCents, 0),
  });

  try {
    let providerId: string | undefined;

    if (resend && env.EMAIL_FROM) {
      const fromAddress = `${restaurant.name} <${env.EMAIL_FROM}>`;
      const result = await resend.emails.send({
        from: fromAddress,
        to: parentEmail,
        replyTo: restaurant.contactEmail || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (result.error) {
        throw new Error(result.error.message || "Resend email delivery failed.");
      }
      providerId = result.data?.id;
    } else {
      throw new Error("Email delivery is not configured. Add a valid RESEND_API_KEY and EMAIL_FROM.");
    }

    // One email sent — but log + stamp every order in the batch so the
    // admin order list shows each as confirmed.
    const now = new Date();
    await prisma.$transaction([
      ...orders.map((order) =>
        prisma.emailLog.create({
          data: {
            orderId: order.id,
            emailType: "ORDER_CONFIRMATION",
            recipient: parentEmail,
            providerId,
            status: EmailStatus.SENT,
            sentAt: now,
          },
        })
      ),
      ...orders.map((order) =>
        prisma.order.update({
          where: { id: order.id },
          data: { confirmationSentAt: now },
        })
      ),
    ]);

    return { ok: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown email error";
    await prisma.emailLog.createMany({
      data: orders.map((order) => ({
        orderId: order.id,
        emailType: "ORDER_CONFIRMATION" as const,
        recipient: parentEmail,
        status: EmailStatus.FAILED,
        errorMessage: messageText,
      })),
    });
    throw error;
  }
}
