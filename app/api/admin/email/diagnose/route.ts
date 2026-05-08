/**
 * Email diagnostics. Hit:
 *   /api/admin/email/diagnose                          (config-only check)
 *   /api/admin/email/diagnose?to=you@example.com       (config check + real send)
 *
 * Auth: requires an admin session. Returns the actual failure reason if
 * Resend rejects the send (e.g. domain not verified, invalid API key).
 */

import { Resend } from "resend";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const adminUserId = session?.user?.adminUserId;
  if (!adminUserId) {
    return NextResponse.json({ error: "Unauthorized — sign in as an admin first" }, { status: 401 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to");

  const config = {
    RESEND_API_KEY_set: Boolean(env.RESEND_API_KEY),
    RESEND_API_KEY_preview: env.RESEND_API_KEY
      ? `${env.RESEND_API_KEY.slice(0, 6)}…(${env.RESEND_API_KEY.length} chars)`
      : null,
    EMAIL_FROM: env.EMAIL_FROM ?? null,
    EMAIL_FROM_NAME: env.EMAIL_FROM_NAME ?? null,
    fromHeader: env.EMAIL_FROM
      ? (env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM)
      : null,
  };

  if (!to) {
    return NextResponse.json({
      ...config,
      hint: "Add ?to=you@example.com to attempt a real send and see Resend's actual response.",
    });
  }

  if (!env.RESEND_API_KEY) {
    return NextResponse.json({
      ...config,
      sendAttempted: false,
      error: "RESEND_API_KEY is not set in this environment. Add it in Vercel → Settings → Environment Variables and redeploy.",
    }, { status: 500 });
  }

  if (!env.EMAIL_FROM) {
    return NextResponse.json({
      ...config,
      sendAttempted: false,
      error: "EMAIL_FROM is not set. Add it in Vercel → Settings → Environment Variables and redeploy.",
    }, { status: 500 });
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: config.fromHeader!,
      to,
      subject: "LunchPad email test",
      text: `This is a test email from LunchPad's diagnostic endpoint.\n\nIf you're seeing this, your Resend integration is working correctly.\n\n— LunchPad`,
      html: `<p>This is a test email from LunchPad's diagnostic endpoint.</p><p>If you're seeing this, your Resend integration is working correctly.</p><p>— LunchPad</p>`,
    });

    if (result.error) {
      return NextResponse.json({
        ...config,
        sendAttempted: true,
        success: false,
        resendError: {
          name: result.error.name ?? null,
          message: result.error.message ?? String(result.error),
        },
      }, { status: 502 });
    }

    return NextResponse.json({
      ...config,
      sendAttempted: true,
      success: true,
      providerId: result.data?.id ?? null,
      hint: "Check your inbox (and spam folder). Also visit Resend → Logs to see the delivery record.",
    });
  } catch (e) {
    return NextResponse.json({
      ...config,
      sendAttempted: true,
      success: false,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    }, { status: 500 });
  }
}
