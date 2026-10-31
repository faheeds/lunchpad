import { Resend } from "resend";
import { EmailStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/utils";
import { logWarn } from "@/lib/log";
import { buildPaymentInstructionLines } from "@/lib/payments/offline-instructions";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Confirmation email for an order the customer will pay offline
 * (cash / Zelle). Best-effort: a failed send never fails the order.
 */
export async function sendOfflineOrderEmail(orderId: string, restaurantId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { school: true, deliveryDate: true, items: true, restaurant: true, payment: true },
  });
  if (!order || !order.payment) return { ok: false as const };

  const r = order.restaurant;
  const method = order.payment.method ?? "cash";
  const lines = buildPaymentInstructionLines({
    method,
    totalCents: order.totalCents,
    zelleHandle: r.zelleHandle,
    instructions: r.offlinePaymentInstructions,
  });
  const when = formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEEE, MMMM d");
  const isDelivery = order.fulfillmentType === "DELIVERY";
  const whereLine = isDelivery
    ? `Delivery to: ${order.deliveryAddress ?? ""}`
    : `Pickup: ${order.school.name}${r.pickupInstructions ? ` — ${r.pickupInstructions}` : ""}`;

  const itemLines = order.items.map((i) => {
    const extras = [...i.additions, ...i.removals.map((x) => `no ${x}`)].join(", ");
    return `${i.itemNameSnapshot}${i.sizeName ? ` (${i.sizeName})` : ""}${extras ? ` — ${extras}` : ""}`;
  });

  const subject = `${r.name} — order ${order.orderNumber} received (payment due: ${formatCurrency(order.totalCents)})`;
  const text = [
    `Hi ${order.parentName},`,
    ``,
    `Thanks for your order with ${r.name}! It's confirmed for ${when}.`,
    ``,
    ...itemLines.map((l) => `• ${l}`),
    ``,
    `Total: ${formatCurrency(order.totalCents)}`,
    whereLine,
    ``,
    `HOW TO PAY`,
    ...lines,
    ``,
    `Order number: ${order.orderNumber}`,
    r.contactPhone ? `Questions? Call ${r.contactPhone}` : r.contactEmail ? `Questions? Email ${r.contactEmail}` : ``,
  ].join("\n");

  const primary = r.primaryColor || "#2C4031";
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#211D15;line-height:1.5">
<h2 style="color:${esc(primary)};margin:0 0 8px">${esc(r.name)}</h2>
<p>Hi ${esc(order.parentName)}, thanks for your order! It's confirmed for <strong>${esc(when)}</strong>.</p>
<ul style="padding-left:18px">${itemLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<p><strong>Total: ${esc(formatCurrency(order.totalCents))}</strong><br>${esc(whereLine)}</p>
<div style="background:#F6F1E6;border:1px solid #E3DBC6;border-radius:12px;padding:12px 14px;margin:14px 0">
<strong>How to pay</strong>${lines.map((l) => `<p style="margin:6px 0 0">${esc(l)}</p>`).join("")}</div>
<p style="color:#938B78;font-size:13px">Order number: ${esc(order.orderNumber)}${r.contactPhone ? `<br>Questions? Call ${esc(r.contactPhone)}` : r.contactEmail ? `<br>Questions? Email ${esc(r.contactEmail)}` : ""}</p>
</div>`;

  try {
    if (!resend || !env.EMAIL_FROM) throw new Error("Email delivery is not configured.");
    const result = await resend.emails.send({
      from: `${r.name} <${env.EMAIL_FROM}>`,
      to: order.parentEmail,
      replyTo: r.contactEmail || undefined,
      subject,
      text,
      html,
    });
    if (result.error) throw new Error(result.error.message || "Resend email delivery failed.");
    await prisma.emailLog.create({
      data: {
        orderId: order.id,
        emailType: "ORDER_OFFLINE_PAYMENT",
        recipient: order.parentEmail,
        providerId: result.data?.id,
        status: EmailStatus.SENT,
        sentAt: new Date(),
      },
    });
    return { ok: true as const };
  } catch (err) {
    logWarn("offline_order_email_failed", {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await prisma.emailLog
      .create({
        data: {
          orderId: order.id,
          emailType: "ORDER_OFFLINE_PAYMENT",
          recipient: order.parentEmail,
          status: EmailStatus.FAILED,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => undefined);
    return { ok: false as const };
  }
}
