import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { z } from "zod";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const schema = z.object({
  name:         z.string().min(1, "Name is required"),
  phone:        z.string().optional(),
  email:        z.string().email("Valid email is required"),
  feedbackType: z.enum(["order_issue", "general_feedback"]),
  orderNumber:  z.string().optional(),
  message:      z.string().min(1, "Message is required"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const { name, phone, email, feedbackType, orderNumber, message } = parsed.data;

  const typeLabel = feedbackType === "order_issue" ? "Order Issue" : "General Feedback";

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1c0505;">
      <div style="background: #1c0505; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <p style="color: #f59e0b; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; margin: 0 0 4px;">
          Medina Academy Hot Lunch
        </p>
        <h1 style="color: white; font-size: 20px; font-weight: 700; margin: 0;">New Contact Submission</h1>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-size: 12px; color: #64748b; width: 120px; vertical-align: top;">Type</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #c41230;">${typeLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 12px; color: #64748b; vertical-align: top;">Name</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 12px; color: #64748b; vertical-align: top;">Email</td>
            <td style="padding: 8px 0; font-size: 14px;"><a href="mailto:${email}" style="color: #c41230;">${email}</a></td>
          </tr>
          ${phone ? `
          <tr>
            <td style="padding: 8px 0; font-size: 12px; color: #64748b; vertical-align: top;">Phone</td>
            <td style="padding: 8px 0; font-size: 14px;">${phone}</td>
          </tr>` : ""}
          ${orderNumber ? `
          <tr>
            <td style="padding: 8px 0; font-size: 12px; color: #64748b; vertical-align: top;">Order #</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${orderNumber}</td>
          </tr>` : ""}
        </table>
        <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #64748b; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">Message</p>
          <p style="font-size: 14px; color: #1c0505; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
        <p style="font-size: 11px; color: #94a3b8; margin-top: 20px;">
          Submitted via medina.localbiggerburger.com contact form
        </p>
      </div>
    </div>
  `;

  const text = [
    `New Contact Submission — ${typeLabel}`,
    ``,
    `Name: ${name}`,
    `Email: ${email}`,
    phone       ? `Phone: ${phone}`        : null,
    orderNumber ? `Order #: ${orderNumber}` : null,
    ``,
    `Message:`,
    message,
  ].filter((l) => l !== null).join("\n");

  if (!resend || !env.EMAIL_FROM) {
    // Email not configured — log and return success so the UX isn't broken
    console.log("[contact] Email not configured. Submission:", { name, email, feedbackType, orderNumber, message });
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await resend.emails.send({
      from: env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
      to:   env.EMAIL_FROM, // send to yourself (admin inbox)
      replyTo: email,       // hitting Reply goes straight to the parent
      subject: `[Hot Lunch] ${typeLabel} from ${name}`,
      html,
      text,
    });

    if (result.error) {
      throw new Error(result.error.message ?? "Email delivery failed.");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact] Failed to send email:", err);
    return NextResponse.json({ error: "Failed to send. Please try again." }, { status: 500 });
  }
}
