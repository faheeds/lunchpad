import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency, formatList } from "@/lib/utils";

// ─── Shared styles ────────────────────────────────────────────────────────────
const base = `font-family:Arial,sans-serif;color:#1c2a35;line-height:1.55;max-width:560px;margin:0 auto`;
const card = `background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px 28px;margin:16px 0`;
const pill = (bg: string, color: string) =>
  `display:inline-block;background:${bg};color:${color};font-size:11px;font-weight:700;border-radius:100px;padding:3px 10px`;

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
  /** Restaurant identity — appears in subject, header, and signature so the
   *  email reads as "from the restaurant" rather than from a generic platform. */
  restaurantName: string;
  restaurantLogoUrl?: string | null;
  restaurantPrimaryColor?: string | null;
  restaurantContactEmail?: string | null;
  restaurantContactPhone?: string | null;
};

/**
 * "Need help?" contact card rendered near the bottom of customer-facing
 * emails. Tells parents who to reach out to (the restaurant, not the
 * platform) and gives them email + phone if available. Returns empty
 * strings for both text + html when neither contact is set.
 */
function helpBlock(args: {
  restaurantName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
}): { text: string; html: string } {
  const { restaurantName, contactEmail, contactPhone } = args;
  if (!contactEmail && !contactPhone) {
    return {
      text: `Need to change or cancel? Just reply to this email and the ${restaurantName} team will help.`,
      html: `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:20px 0;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#1c2a35;">Need help?</p>
          <p style="margin:0;font-size:13px;color:#475569;line-height:1.5">
            Just reply to this email and the <strong>${restaurantName}</strong> team will help.
          </p>
        </div>`,
    };
  }
  const lines: string[] = [`Need to change or cancel your order? Reach the ${restaurantName} team:`];
  if (contactEmail) lines.push(`  Email: ${contactEmail}`);
  if (contactPhone) lines.push(`  Phone: ${contactPhone}`);
  const htmlLinks: string[] = [];
  if (contactEmail) htmlLinks.push(`<a href="mailto:${contactEmail}" style="color:#1c2a35;text-decoration:underline">${contactEmail}</a>`);
  if (contactPhone) htmlLinks.push(`<a href="tel:${contactPhone.replace(/[^+\d]/g, "")}" style="color:#1c2a35;text-decoration:underline">${contactPhone}</a>`);
  return {
    text: lines.join("\n"),
    html: `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:20px 0;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#1c2a35;">Need help?</p>
        <p style="margin:0 0 4px;font-size:13px;color:#475569;line-height:1.5">
          To change or cancel your order, reach the <strong>${restaurantName}</strong> team:
        </p>
        <p style="margin:4px 0 0;font-size:13px;color:#1c2a35;line-height:1.6">
          ${htmlLinks.join("&nbsp;&middot;&nbsp;")}
        </p>
      </div>`,
  };
}

/** Small reusable header band that brands the email with the restaurant. */
function brandHeader(name: string, logoUrl?: string | null, primaryColor?: string | null) {
  const accent = primaryColor || "#c41230";
  if (logoUrl) {
    return `
      <div style="background:${accent};padding:18px 24px;border-radius:10px 10px 0 0;text-align:left;">
        <img src="${logoUrl}" alt="${name}" style="max-height:36px;max-width:200px;display:inline-block;vertical-align:middle;background:#ffffff;border-radius:6px;padding:4px 8px" />
        <span style="color:#ffffff;font-weight:700;font-size:15px;margin-left:10px;vertical-align:middle">${name}</span>
      </div>`;
  }
  return `
    <div style="background:${accent};padding:18px 24px;border-radius:10px 10px 0 0;">
      <p style="color:#ffffff;margin:0;font-weight:700;font-size:18px;letter-spacing:-0.01em">${name}</p>
    </div>`;
}

export function buildConfirmationEmail(args: ConfirmationTemplateArgs) {
  const deliveryDate = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d");
  const help = helpBlock({
    restaurantName: args.restaurantName,
    contactEmail: args.restaurantContactEmail,
    contactPhone: args.restaurantContactPhone,
  });

  return {
    subject: `${args.restaurantName} — order confirmed (${args.orderNumber})`,
    text: [
      `Hi ${args.parentName},`,
      "",
      `Your order from ${args.restaurantName} for ${args.studentName} is confirmed for ${deliveryDate}.`,
      ...args.items.flatMap((item, index) => [
        `Item ${index + 1}: ${item.itemName}`,
        `Additions: ${formatList(item.additions)}`,
        `Removals: ${formatList(item.removals)}`
      ]),
      `Allergy note: ${args.allergyNotes || "None"}`,
      `Amount paid: ${formatCurrency(args.amountCents)}`,
      `Order number: ${args.orderNumber}`,
      "",
      help.text,
      "",
      `Thanks for ordering with ${args.restaurantName}.`,
      `— The ${args.restaurantName} team`
    ].join("\n"),
    html: `
      <div style="${base}">
        ${brandHeader(args.restaurantName, args.restaurantLogoUrl, args.restaurantPrimaryColor)}
        <div style="${card};border-top:none;border-radius:0 0 10px 10px;margin-top:0">
          <h2 style="margin:0 0 12px;font-size:20px;color:#1c2a35">Order confirmed</h2>
          <p style="margin:0 0 8px">Hi ${args.parentName},</p>
          <p style="margin:0 0 16px">Your order for <strong>${args.studentName}</strong> is confirmed for <strong>${deliveryDate}</strong>.</p>
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
          ${help.html}
          <p style="margin:16px 0 4px">Thanks for ordering with <strong>${args.restaurantName}</strong>.</p>
          <p style="margin:0;color:#64748b;font-size:13px">— The ${args.restaurantName} team</p>
        </div>
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
  restaurantName: string;
  restaurantLogoUrl?: string | null;
  restaurantPrimaryColor?: string | null;
  restaurantContactEmail?: string | null;
  restaurantContactPhone?: string | null;
};

export function buildCancellationEmail(args: CancellationTemplateArgs) {
  const deliveryDateStr = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d");
  const itemsList = args.items.map((i) => i.itemName).join(", ");
  const help = helpBlock({
    restaurantName: args.restaurantName,
    contactEmail: args.restaurantContactEmail,
    contactPhone: args.restaurantContactPhone,
  });

  return {
    subject: `${args.restaurantName} — order cancelled (${args.orderNumber})`,
    text: [
      `Hi ${args.parentName},`,
      "",
      `Your order from ${args.restaurantName} for ${args.studentName} on ${deliveryDateStr} has been cancelled.`,
      "",
      `Items cancelled: ${itemsList}`,
      `Refund amount: ${formatCurrency(args.amountCents)}`,
      `Order number: ${args.orderNumber}`,
      "",
      "Your refund will be returned to the original payment method within 5-10 business days.",
      "",
      `If you did not request this cancellation, please reply to this email and the ${args.restaurantName} team will help.`
    ].join("\n"),
    html: `
      <div style="${base}">
        ${brandHeader(args.restaurantName, args.restaurantLogoUrl, args.restaurantPrimaryColor)}
        <div style="${card};border-top:none;border-radius:0 0 10px 10px;margin-top:0">
          <h2 style="margin:0 0 12px;font-size:20px;color:#1c2a35">Order cancelled</h2>
          <p style="margin:0 0 8px">Hi ${args.parentName},</p>
          <p style="margin:0 0 16px">Your order for <strong>${args.studentName}</strong> on <strong>${deliveryDateStr}</strong> has been cancelled.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr><td style="padding: 6px 0;"><strong>Items</strong></td><td>${itemsList}</td></tr>
            <tr><td style="padding: 6px 0;"><strong>Refund amount</strong></td><td>${formatCurrency(args.amountCents)}</td></tr>
            <tr><td style="padding: 6px 0;"><strong>Order number</strong></td><td>${args.orderNumber}</td></tr>
          </table>
          <p style="margin:0 0 8px">Your refund will be returned to the original payment method within <strong>5-10 business days</strong>.</p>
          ${help.html}
          <p style="color:#64748b;font-size:13px;margin:8px 0 0">If you did not request this cancellation, please contact the ${args.restaurantName} team using the info above.</p>
        </div>
      </div>
    `
  };
}

type RefundTemplateArgs = {
  parentName: string;
  studentName: string;
  deliveryDate: Date;
  timezone: string;
  items: { itemName: string }[];
  amountCents: number;
  orderNumber: string;
  restaurantName: string;
  restaurantLogoUrl?: string | null;
  restaurantPrimaryColor?: string | null;
  restaurantContactEmail?: string | null;
  restaurantContactPhone?: string | null;
};

export function buildRefundEmail(args: RefundTemplateArgs) {
  const deliveryDateStr = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d");
  const itemsList = args.items.map((i) => i.itemName).join(", ");
  const help = helpBlock({
    restaurantName: args.restaurantName,
    contactEmail: args.restaurantContactEmail,
    contactPhone: args.restaurantContactPhone,
  });

  return {
    subject: `${args.restaurantName} — refund issued (${args.orderNumber})`,
    text: [
      `Hi ${args.parentName},`,
      "",
      `A refund has been issued for your order from ${args.restaurantName} for ${args.studentName} on ${deliveryDateStr}.`,
      "",
      `Items refunded: ${itemsList}`,
      `Refund amount: ${formatCurrency(args.amountCents)}`,
      `Order number: ${args.orderNumber}`,
      "",
      "Your refund will be returned to the original payment method within 5-10 business days.",
      "",
      `If you have any questions about this refund, please reply to this email and the ${args.restaurantName} team will help.`
    ].join("\n"),
    html: `
      <div style="${base}">
        ${brandHeader(args.restaurantName, args.restaurantLogoUrl, args.restaurantPrimaryColor)}
        <div style="${card};border-top:none;border-radius:0 0 10px 10px;margin-top:0">
          <h2 style="margin:0 0 12px;font-size:20px;color:#1c2a35">Refund issued</h2>
          <p style="margin:0 0 8px">Hi ${args.parentName},</p>
          <p style="margin:0 0 16px">A refund has been issued for your order for <strong>${args.studentName}</strong> on <strong>${deliveryDateStr}</strong>.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr><td style="padding: 6px 0;"><strong>Items</strong></td><td>${itemsList}</td></tr>
            <tr><td style="padding: 6px 0;"><strong>Refund amount</strong></td><td>${formatCurrency(args.amountCents)}</td></tr>
            <tr><td style="padding: 6px 0;"><strong>Order number</strong></td><td>${args.orderNumber}</td></tr>
          </table>
          <p style="margin:0 0 8px">Your refund will be returned to the original payment method within <strong>5-10 business days</strong>.</p>
          ${help.html}
          <p style="color:#64748b;font-size:13px;margin:8px 0 0">If you have questions about this refund, please contact the ${args.restaurantName} team using the info above.</p>
        </div>
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

// ─── Kitchen prep summary ────────────────────────────────────────────────────

type KitchenPrepOrder = {
  studentName: string;
  grade: string;
  additions: string[];
  removals: string[];
  allergyNotes: string | null;
  specialInstructions: string | null;
};

type KitchenPrepTemplateArgs = {
  restaurantName: string;
  schoolName: string;
  deliveryDate: Date;
  timezone: string;
  /** Map of item name → list of orders for that item */
  itemGroups: { itemName: string; orders: KitchenPrepOrder[] }[];
  totalOrders: number;
};

export function buildKitchenPrepEmail(args: KitchenPrepTemplateArgs) {
  const dateStr = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d, yyyy");

  const itemRows = args.itemGroups
    .map(
      (group) => `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="${pill("#fff0f3","#c41230")}">${group.orders.length}×</span>
          <strong style="font-size:14px">${group.itemName}</strong>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600">Student</th>
              <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600">Grade</th>
              <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600">Customisations</th>
              <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${group.orders
              .map(
                (o, i) => `
            <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600">${o.studentName}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;color:#6b7280">${o.grade}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">
                ${o.additions.length ? `<span style="color:#15803d">+${o.additions.join(", ")}</span>` : ""}
                ${o.additions.length && o.removals.length ? " &nbsp;" : ""}
                ${o.removals.length ? `<span style="color:#dc2626">−${o.removals.join(", ")}</span>` : ""}
                ${!o.additions.length && !o.removals.length ? '<span style="color:#9ca3af">—</span>' : ""}
              </td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;color:#d97706;font-size:11px">
                ${[o.allergyNotes, o.specialInstructions].filter(Boolean).join(" | ") || "—"}
              </td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`
    )
    .join("");

  const subject = `Kitchen sheet: ${args.schoolName} — ${dateStr} (${args.totalOrders} orders)`;
  const text = [
    `Kitchen Sheet — ${args.restaurantName}`,
    `${args.schoolName} | ${dateStr}`,
    `Total orders: ${args.totalOrders}`,
    "",
    ...args.itemGroups.flatMap((g) => [
      `${g.itemName} (${g.orders.length}):`,
      ...g.orders.map(
        (o) =>
          `  ${o.studentName} (${o.grade})` +
          (o.additions.length ? ` +${o.additions.join(",")}` : "") +
          (o.removals.length ? ` -${o.removals.join(",")}` : "") +
          ([o.allergyNotes, o.specialInstructions].filter(Boolean).length
            ? ` [${[o.allergyNotes, o.specialInstructions].filter(Boolean).join(" | ")}]`
            : "")
      ),
      "",
    ]),
  ].join("\n");

  const html = `
    <div style="${base}">
      <div style="background:linear-gradient(135deg,#0f1923,#1a2d42);border-radius:10px;padding:20px 28px;margin-bottom:16px">
        <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.12em;margin:0 0 4px">Kitchen Sheet</p>
        <h1 style="font-size:20px;font-weight:800;color:white;margin:0 0 4px;letter-spacing:-0.02em">${args.restaurantName}</h1>
        <p style="font-size:13px;color:rgba(255,255,255,0.6);margin:0">${args.schoolName} &middot; ${dateStr}</p>
        <div style="margin-top:12px">
          <span style="${pill("rgba(196,18,48,0.3)","#f87171")}">${args.totalOrders} orders total</span>
        </div>
      </div>
      <div style="${card}">
        ${itemRows}
      </div>
      <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:16px">
        Generated by LunchPad &middot; ${args.restaurantName}
      </p>
    </div>
  `;

  return { subject, text, html };
}

// ─── Welcome email (new restaurant signup) ────────────────────────────────────

type WelcomeRestaurantTemplateArgs = {
  ownerName: string;
  restaurantName: string;
  slug: string;
  setupUrl: string;
  orderingUrl: string;
};

export function buildWelcomeRestaurantEmail(args: WelcomeRestaurantTemplateArgs) {
  const subject = `Welcome to LunchPad, ${args.restaurantName}!`;

  const text = [
    `Hi ${args.ownerName},`,
    "",
    `Welcome to LunchPad! Your account for ${args.restaurantName} is all set.`,
    "",
    `Your ordering page: ${args.orderingUrl}`,
    `Set up your account: ${args.setupUrl}`,
    "",
    "Next steps:",
    "1. Add your menu items (photos, prices, add-ons)",
    "2. Add your first location",
    "3. Create your first delivery dates",
    "4. Connect your Stripe account to accept payments",
    "5. Share your ordering page with your customers",
    "",
    "Your 14-day free trial has started. No credit card needed until the trial ends.",
    "",
    "— The LunchPad Team",
  ].join("\n");

  const steps = [
    { n: "1", title: "Build your menu", body: "Add items with photos, prices, and customization options" },
    { n: "2", title: "Add your first location", body: "Set up your first school or office with delivery schedule" },
    { n: "3", title: "Connect Stripe", body: "Link your Stripe account so customers can pay you directly" },
    { n: "4", title: "Share your link", body: `Send ${args.orderingUrl} to your customers` },
  ];

  const html = `
    <div style="${base}">
      <div style="background:linear-gradient(135deg,#0f1923,#1a2d42);border-radius:10px;padding:28px;margin-bottom:16px;text-align:center">
        <div style="margin-bottom:16px">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block">
            <rect width="32" height="32" rx="7" fill="#c41230"/>
            <path d="M 4 19 A 12 10 0 0 1 28 19" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="10" y1="5.5" x2="22" y2="5.5" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="16" y1="5.5" x2="16" y2="9" stroke="white" stroke-width="2" stroke-linecap="round"/>
            <rect x="3" y="20.5" width="26" height="5.5" rx="2.75" fill="white"/>
          </svg>
        </div>
        <h1 style="font-size:22px;font-weight:900;color:white;margin:0 0 6px;letter-spacing:-0.02em">
          Welcome to LunchPad!
        </h1>
        <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0">
          ${args.restaurantName} is live — your 14-day trial has started
        </p>
      </div>

      <div style="${card}">
        <p style="font-size:14px;margin:0 0 16px">Hi ${args.ownerName},</p>
        <p style="font-size:13px;color:#4b5563;margin:0 0 20px;line-height:1.65">
          Your LunchPad account is ready. Follow these four steps to accept your first order in under an hour.
        </p>
        ${steps
          .map(
            (s) => `
          <div style="display:flex;gap:14px;margin-bottom:14px;align-items:flex-start">
            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#c41230,#8b0d22);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <span style="font-size:12px;font-weight:900;color:white">${s.n}</span>
            </div>
            <div>
              <p style="font-size:13px;font-weight:700;color:#0f1923;margin:0 0 2px">${s.title}</p>
              <p style="font-size:12px;color:#6b7280;margin:0">${s.body}</p>
            </div>
          </div>`
          )
          .join("")}
        <a href="${args.setupUrl}"
           style="display:block;text-align:center;padding:13px;border-radius:8px;margin-top:20px;font-size:13px;font-weight:700;text-decoration:none;color:white;background:linear-gradient(135deg,#c41230,#8b0d22);box-shadow:0 4px 16px rgba(196,18,48,0.3)">
          Go to setup wizard →
        </a>
      </div>

      <div style="${card};background:#f8fafc">
        <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px">Your ordering page</p>
        <p style="font-size:13px;font-family:monospace;color:#c41230;margin:0 0 4px">${args.orderingUrl}</p>
        <p style="font-size:11px;color:#9ca3af;margin:0">Share this with your customers once you&apos;ve completed setup</p>
      </div>

      <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:16px">
        LunchPad &middot; Lunch ordering made simple
      </p>
    </div>
  `;

  return { subject, text, html };
}

// ─── Order modified by admin ──────────────────────────────────────────────────

type OrderModifiedTemplateArgs = {
  parentName: string;
  studentName: string;
  deliveryDate: Date;
  timezone: string;
  orderNumber: string;
  items: { itemName: string; additions: string[]; removals: string[] }[];
  allergyNotes?: string | null;
  amountCents: number;
  adminNote?: string | null;
};

export function buildOrderModifiedEmail(args: OrderModifiedTemplateArgs) {
  const deliveryDateStr = formatInTimeZone(args.deliveryDate, args.timezone, "EEEE, MMMM d");

  const subject = `Your order has been updated — ${args.orderNumber}`;

  const text = [
    `Hi ${args.parentName},`,
    "",
    `Your order for ${args.studentName} on ${deliveryDateStr} has been updated by the restaurant.`,
    "",
    `Updated items:`,
    ...args.items.flatMap((item, i) => [
      `Item ${i + 1}: ${item.itemName}`,
      item.additions.length ? `  + ${item.additions.join(", ")}` : null,
      item.removals.length ? `  - ${item.removals.join(", ")}` : null,
    ].filter(Boolean) as string[]),
    "",
    args.allergyNotes ? `Allergy note: ${args.allergyNotes}` : null,
    `Order total: ${formatCurrency(args.amountCents)}`,
    `Order number: ${args.orderNumber}`,
    args.adminNote ? `\nNote from restaurant: ${args.adminNote}` : null,
    "",
    "If you have questions about this change, please contact the restaurant directly.",
  ].filter((l) => l !== null).join("\n");

  const itemRows = args.items
    .map(
      (item, i) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;font-size:13px;white-space:nowrap">Item ${i + 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px">
        ${item.itemName}
        ${item.additions.length ? `<br><span style="color:#15803d;font-size:12px">+${item.additions.join(", ")}</span>` : ""}
        ${item.removals.length ? `<br><span style="color:#dc2626;font-size:12px">−${item.removals.join(", ")}</span>` : ""}
      </td>
    </tr>`
    )
    .join("");

  const html = `
    <div style="${base}">
      <div style="background:linear-gradient(135deg,#0f1923,#1a2d42);border-radius:10px;padding:20px 28px;margin-bottom:16px">
        <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.12em;margin:0 0 4px">Order Updated</p>
        <h1 style="font-size:20px;font-weight:800;color:white;margin:0 0 4px;letter-spacing:-0.02em">${args.orderNumber}</h1>
        <p style="font-size:13px;color:rgba(255,255,255,0.6);margin:0">${args.studentName} &middot; ${deliveryDateStr}</p>
      </div>

      <div style="${card}">
        <p style="font-size:14px;margin:0 0 14px">Hi ${args.parentName},</p>
        <p style="font-size:13px;color:#4b5563;margin:0 0 16px;line-height:1.65">
          The restaurant has made an update to your order for <strong>${args.studentName}</strong> on <strong>${deliveryDateStr}</strong>.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
          ${itemRows}
          ${args.allergyNotes ? `
          <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;font-size:13px;white-space:nowrap;color:#d97706">Allergy note</td>
            <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#d97706">${args.allergyNotes}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:8px 10px;font-weight:600;font-size:13px;white-space:nowrap">Order total</td>
            <td style="padding:8px 10px;font-size:13px;font-weight:700">${formatCurrency(args.amountCents)}</td>
          </tr>
        </table>
        ${args.adminNote ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-top:4px">
          <p style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px">Note from restaurant</p>
          <p style="font-size:13px;color:#78350f;margin:0;line-height:1.5">${args.adminNote}</p>
        </div>` : ""}
      </div>

      <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:16px">
        If you have questions, please contact the restaurant directly.
      </p>
    </div>
  `;

  return { subject, text, html };
}

// ─── Subscription plan change ────────────────────────────────────────────────

type SubscriptionChangedTemplateArgs = {
  ownerName: string;
  restaurantName: string;
  oldPlan: string;
  newPlan: string;
  newPriceLabel: string;            // e.g. "$149/mo"
  prorationCents: number;           // positive = charge, negative = credit
  nextInvoiceDate: Date | null;
  nextInvoiceTotalCents: number | null;
  billingPortalUrl?: string | null;
};

export function buildSubscriptionChangedEmail(args: SubscriptionChangedTemplateArgs) {
  const direction =
    args.prorationCents > 0 ? "upgrade" : args.prorationCents < 0 ? "downgrade" : "change";
  const subject = `Your LunchPad plan: ${args.oldPlan} → ${args.newPlan}`;

  const prorationLabel =
    args.prorationCents > 0
      ? `Prorated charge today: ${formatCurrency(args.prorationCents)}`
      : args.prorationCents < 0
      ? `Credit applied to your account: ${formatCurrency(Math.abs(args.prorationCents))}`
      : "No proration needed.";

  const nextLine =
    args.nextInvoiceDate && args.nextInvoiceTotalCents !== null
      ? `Next invoice: ${formatCurrency(args.nextInvoiceTotalCents)} on ${
          args.nextInvoiceDate.toISOString().slice(0, 10)
        }`
      : "Your next invoice will reflect the new plan.";

  const text = [
    `Hi ${args.ownerName},`,
    "",
    `Your LunchPad subscription for ${args.restaurantName} has been ${direction === "change" ? "updated" : direction === "upgrade" ? "upgraded" : "downgraded"}.`,
    "",
    `Previous plan: ${args.oldPlan}`,
    `New plan: ${args.newPlan} (${args.newPriceLabel})`,
    "",
    prorationLabel,
    nextLine,
    "",
    "The change is effective immediately. You can review billing details and history in your admin dashboard.",
    "",
    "— The LunchPad Team",
  ].join("\n");

  const isUpgrade = args.prorationCents > 0;

  const html = `
    <div style="${base}">
      <div style="background:linear-gradient(135deg,#0f1923,#1a2d42);border-radius:10px;padding:24px;margin-bottom:16px;text-align:center">
        <h1 style="font-size:20px;font-weight:800;color:white;margin:0 0 6px;letter-spacing:-0.02em">
          Plan ${direction === "upgrade" ? "upgraded" : direction === "downgrade" ? "downgraded" : "updated"}
        </h1>
        <p style="font-size:13px;color:rgba(255,255,255,0.6);margin:0">
          ${args.restaurantName} is now on ${args.newPlan}
        </p>
      </div>

      <div style="${card}">
        <p style="font-size:14px;margin:0 0 18px">Hi ${args.ownerName},</p>

        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:18px">
          <tr>
            <td style="padding:8px 0;font-size:12px;color:#6b7280;width:140px">Previous plan</td>
            <td style="padding:8px 0;font-size:13px;color:#1c2a35">${args.oldPlan}</td>
          </tr>
          <tr style="border-top:1px solid #f1f5f9">
            <td style="padding:8px 0;font-size:12px;color:#6b7280">New plan</td>
            <td style="padding:8px 0;font-size:13px;font-weight:700;color:#1c2a35">
              ${args.newPlan} <span style="color:#6b7280;font-weight:400">· ${args.newPriceLabel}</span>
            </td>
          </tr>
          <tr style="border-top:1px solid #f1f5f9">
            <td style="padding:8px 0;font-size:12px;color:#6b7280">${args.prorationCents >= 0 ? "Prorated charge" : "Credit applied"}</td>
            <td style="padding:8px 0;font-size:13px;font-weight:700;color:${isUpgrade ? "#1c2a35" : "#15803d"}">
              ${args.prorationCents === 0 ? "—" : formatCurrency(Math.abs(args.prorationCents))}
              ${args.prorationCents < 0 ? `<span style="${pill("#dcfce7", "#15803d")};margin-left:8px">CREDIT</span>` : ""}
            </td>
          </tr>
          ${args.nextInvoiceDate && args.nextInvoiceTotalCents !== null ? `
          <tr style="border-top:1px solid #f1f5f9">
            <td style="padding:8px 0;font-size:12px;color:#6b7280">Next invoice</td>
            <td style="padding:8px 0;font-size:13px;color:#1c2a35">
              ${formatCurrency(args.nextInvoiceTotalCents)} on ${args.nextInvoiceDate.toISOString().slice(0, 10)}
            </td>
          </tr>` : ""}
        </table>

        <p style="font-size:12px;color:#6b7280;margin:0;line-height:1.6">
          The change is effective immediately. ${
            args.prorationCents < 0
              ? "Your credit will be applied automatically to your next invoice."
              : args.prorationCents > 0
              ? "The prorated charge has been added to your current billing cycle."
              : ""
          }
        </p>
      </div>

      <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0">
        Questions? Reply to this email or visit your admin dashboard.
      </p>
    </div>
  `;

  return { subject, text, html };
}

// ─── Admin team invite ───────────────────────────────────────────────────────

type AdminInviteTemplateArgs = {
  inviterName: string;
  restaurantName: string;
  /** Display label for the role: "Owner" / "Manager" / "Staff". */
  roleLabel: string;
  acceptUrl: string;
  /** How long until the invite link expires — surfaced in copy. */
  expiresInDays: number;
};

export function buildAdminInviteEmail(args: AdminInviteTemplateArgs) {
  const { inviterName, restaurantName, roleLabel, acceptUrl, expiresInDays } = args;

  const subject = `${inviterName} invited you to join ${restaurantName} on LunchPad`;

  const text = `${inviterName} invited you to join the ${restaurantName} admin team as ${roleLabel}.

Accept your invite (expires in ${expiresInDays} days):
${acceptUrl}

After clicking the link you'll be able to set your name and password.

If you weren't expecting this invitation, you can safely ignore the email.`;

  const html = `
    <div style="${base}">
      <div style="${card}">
        <h1 style="font-size:18px;font-weight:600;margin:0 0 12px;color:#0f172a">
          You're invited to ${restaurantName}
        </h1>
        <p style="margin:0 0 16px;font-size:14px;color:#334155">
          <strong>${inviterName}</strong> invited you to join the <strong>${restaurantName}</strong> admin team on LunchPad as <strong>${roleLabel}</strong>.
        </p>
        <p style="margin:0 0 20px">
          <a href="${acceptUrl}"
             style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;padding:12px 22px">
            Accept invitation
          </a>
        </p>
        <p style="margin:0 0 14px;font-size:12px;color:#64748b">
          This link expires in ${expiresInDays} days and can only be used once. After clicking it you'll set your own name and password.
        </p>
        <p style="margin:0 0 14px;font-size:12px;color:#64748b">
          If the button doesn't work, paste this URL into your browser:<br>
          <span style="font-size:11px;color:#475569;word-break:break-all">${acceptUrl}</span>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0" />
        <p style="margin:0;font-size:12px;color:#64748b">
          Didn't expect this? You can safely ignore the email — no account will be created without you accepting.
        </p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

// ─── Admin password reset ────────────────────────────────────────────────────

type AdminPasswordResetTemplateArgs = {
  adminName: string;
  restaurantName: string;
  resetUrl: string;
  /** Lifetime in minutes — surfaced in copy so the recipient knows when the
   *  link will stop working. */
  expiresInMinutes: number;
};

export function buildAdminPasswordResetEmail(args: AdminPasswordResetTemplateArgs) {
  const { adminName, restaurantName, resetUrl, expiresInMinutes } = args;

  const subject = `Reset your ${restaurantName} admin password`;

  const text = `Hi ${adminName},

We received a request to reset the password on your ${restaurantName} admin account.

Reset link (expires in ${expiresInMinutes} minutes):
${resetUrl}

If you didn't request this, you can safely ignore the email — your current password stays the same.`;

  const html = `
    <div style="${base}">
      <div style="${card}">
        <h1 style="font-size:18px;font-weight:600;margin:0 0 12px;color:#0f172a">
          Reset your admin password
        </h1>
        <p style="margin:0 0 16px;font-size:14px;color:#334155">
          Hi ${adminName}, we received a request to reset the password on your <strong>${restaurantName}</strong> admin account.
        </p>
        <p style="margin:0 0 20px">
          <a href="${resetUrl}"
             style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;padding:12px 22px">
            Set a new password
          </a>
        </p>
        <p style="margin:0 0 14px;font-size:12px;color:#64748b">
          This link expires in ${expiresInMinutes} minutes and can only be used once.
        </p>
        <p style="margin:0 0 14px;font-size:12px;color:#64748b">
          If the button doesn't work, paste this URL into your browser:<br>
          <span style="font-size:11px;color:#475569;word-break:break-all">${resetUrl}</span>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0" />
        <p style="margin:0;font-size:12px;color:#64748b">
          Didn't request this? You can safely ignore the email — your current password stays the same.
        </p>
      </div>
    </div>
  `;

  return { subject, text, html };
}
