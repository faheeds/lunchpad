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
