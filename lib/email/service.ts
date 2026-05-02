import { Resend } from "resend";
import { EmailStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  buildConfirmationEmail,
  buildCancellationEmail,
  buildCutoffReminderEmail,
} from "@/lib/email/templates";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendOrderConfirmationEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
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

export async function sendCancellationEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
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

export async function scheduleCutoffReminderEmail(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
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
