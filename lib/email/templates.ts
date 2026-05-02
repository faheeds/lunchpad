import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency, formatList } from "@/lib/utils";

type ConfirmationTemplateArgs = {
  parentName: string;
  studentName: string;
  deliveryDate: Date;
  timezone: string;
  items: {
    itemName: string;
    additions: string[];
    removals: string[];
  }[];
  allergyNotes?: string | null;
  amountCents: number;
  orderNumber: string;
};

export function buildConfirmationEmail(args: ConfirmationTemplateArgs) {
  const deliveryDate = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d");

  return {
    subject: `Lunch order confirmed: ${args.orderNumber}`,
    text: [
      `Hi ${args.parentName},`,
      "",
      `Your order for ${args.studentName} has been confirmed for ${deliveryDate}.`,
      ...args.items.flatMap((item, index) => [
        `Item ${index + 1}: ${item.itemName}`,
        `Additions: ${formatList(item.additions)}`,
        `Removals: ${formatList(item.removals)}`
      ]),
      `Allergy note: ${args.allergyNotes || "None"}`,
      `Amount paid: ${formatCurrency(args.amountCents)}`,
      `Order number: ${args.orderNumber}`,
      "",
      "Thank you for ordering with us."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #12212f; line-height: 1.5;">
        <h2 style="margin-bottom: 12px;">Lunch order confirmed</h2>
        <p>Hi ${args.parentName},</p>
        <p>Your order for <strong>${args.studentName}</strong> has been confirmed for <strong>${deliveryDate}</strong>.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          ${args.items
            .map(
              (item, index) => `
          <tr><td style="padding: 6px 0;"><strong>Item ${index + 1}</strong></td><td>${item.itemName}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Additions</strong></td><td>${formatList(item.additions)}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Removals</strong></td><td>${formatList(item.removals)}</td></tr>`
            )
            .join("")}
          <tr><td style="padding: 6px 0;"><strong>Allergy note</strong></td><td>${args.allergyNotes || "None"}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Amount paid</strong></td><td>${formatCurrency(args.amountCents)}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Order number</strong></td><td>${args.orderNumber}</td></tr>
        </table>
        <p>Thank you for ordering with us.</p>
      </div>
    `
  };
}

type CancellationTemplateArgs = {
  parentName: string;
  studentName: string;
  deliveryDate: Date;
  timezone: string;
  items: { itemName: string }[];
  amountCents: number;
  orderNumber: string;
};

export function buildCancellationEmail(args: CancellationTemplateArgs) {
  const deliveryDateStr = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d");
  const itemsList = args.items.map((i) => i.itemName).join(", ");

  return {
    subject: `Order cancelled: ${args.orderNumber}`,
    text: [
      `Hi ${args.parentName},`,
      "",
      `Your order for ${args.studentName} on ${deliveryDateStr} has been cancelled.`,
      "",
      `Items cancelled: ${itemsList}`,
      `Refund amount: ${formatCurrency(args.amountCents)}`,
      `Order number: ${args.orderNumber}`,
      "",
      "Your refund will be returned to the original payment method within 5-10 business days.",
      "",
      "If you did not request this cancellation, please contact us immediately."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #12212f; line-height: 1.5;">
        <h2 style="margin-bottom: 12px;">Order cancelled</h2>
        <p>Hi ${args.parentName},</p>
        <p>Your order for <strong>${args.studentName}</strong> on <strong>${deliveryDateStr}</strong> has been cancelled.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 6px 0;"><strong>Items</strong></td><td>${itemsList}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Refund amount</strong></td><td>${formatCurrency(args.amountCents)}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Order number</strong></td><td>${args.orderNumber}</td></tr>
        </table>
        <p>Your refund will be returned to the original payment method within <strong>5-10 business days</strong>.</p>
        <p style="color:#78716c;font-size:13px;">If you did not request this cancellation, please contact us immediately.</p>
      </div>
    `
  };
}

type CutoffReminderTemplateArgs = {
  parentName: string;
  studentName: string;
  deliveryDate: Date;
  cutoffAt: Date;
  timezone: string;
  orderUrl: string;
  schoolName: string;
};

export function buildCutoffReminderEmail(args: CutoffReminderTemplateArgs) {
  const deliveryDateStr = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d");
  const cutoffStr = formatInTimeZone(args.cutoffAt, args.timezone, "MMMM d 'at' h:mm a zzz");

  return {
    subject: `Reminder: ordering for ${args.studentName} closes ${cutoffStr}`,
    text: [
      `Hi ${args.parentName},`,
      "",
      `This is a reminder that ordering for ${args.studentName}'s lunch on ${deliveryDateStr} at ${args.schoolName} closes ${cutoffStr}.`,
      "",
      `Order here: ${args.orderUrl}`,
      "",
      "If you have already placed an order, you can ignore this message."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #12212f; line-height: 1.5;">
        <h2 style="margin-bottom: 12px;">Ordering closes soon</h2>
        <p>Hi ${args.parentName},</p>
        <p>Ordering for <strong>${args.studentName}</strong>'s lunch on <strong>${deliveryDateStr}</strong>
           at <strong>${args.schoolName}</strong> closes <strong>${cutoffStr}</strong>.</p>
        <p style="margin: 20px 0;">
          <a href="${args.orderUrl}"
             style="background:#c41230;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;">
            Place Order Now
          </a>
        </p>
        <p style="color:#78716c;font-size:13px;">
          If you have already placed an order, you can ignore this message.
        </p>
      </div>
    `
  };
}
