/**
 * Password reset diagnostics.
 *
 *   /api/admin/password-reset/diagnose                            (config check only)
 *   /api/admin/password-reset/diagnose?email=admin@example.com    (also checks admin lookup)
 *   /api/admin/password-reset/diagnose?email=…&attempt=1          (also runs a real send)
 *
 * No auth — by definition we can't require a session for a flow used by
 * locked-out admins. This endpoint reveals whether an admin exists for the
 * given email at the current tenant; that's the same information leaked by
 * any "forgot password" flow that returns useful errors. Treat it as a
 * temporary debug tool, not a permanent surface — fine to leave in for now,
 * but worth tightening later if it ever becomes a target.
 */

import { Resend } from "resend";
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { getRequestBaseUrl } from "@/lib/request-base-url";
import { buildAdminPasswordResetEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_TOKEN_LIFETIME_MINUTES = 60;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase() || null;
  const attemptSend = url.searchParams.get("attempt") === "1";

  // ─── 1. Tenant resolution ────────────────────────────────────────────────
  const restaurant = await getCurrentRestaurant();
  const tenant = restaurant
    ? { resolved: true, id: restaurant.id, name: restaurant.name, slug: restaurant.slug }
    : { resolved: false, hint: "No x-restaurant-slug header on this request — open this URL on your tenant subdomain (e.g. shake-shack.lunchpad.us) instead of the apex." };

  // ─── 2. Resend / EMAIL_FROM config ───────────────────────────────────────
  const resendConfigured = Boolean(env.RESEND_API_KEY) && Boolean(env.EMAIL_FROM);
  const resend = {
    RESEND_API_KEY_set: Boolean(env.RESEND_API_KEY),
    EMAIL_FROM: env.EMAIL_FROM ?? null,
    EMAIL_FROM_NAME: env.EMAIL_FROM_NAME ?? null,
    configured: resendConfigured,
  };

  // ─── 3. Reset-token table existence ──────────────────────────────────────
  // A migrated DB will have this table. If `prisma db push` wasn't run after
  // adding the model, the very first query throws — which is almost always
  // why operators end up here. We probe with a cheap aggregate so failure
  // gives a clear "table does not exist" reason without leaking row data.
  let tableProbe: Record<string, unknown>;
  try {
    const c = await prisma.adminPasswordResetToken.count();
    tableProbe = { exists: true, rowCount: c };
  } catch (err) {
    tableProbe = {
      exists: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      hint: "Run `npx prisma db push` against your production DATABASE_URL so the AdminPasswordResetToken table is created.",
    };
  }

  // ─── 4. Admin lookup for the supplied email ──────────────────────────────
  let adminProbe: Record<string, unknown> | null = null;
  if (email) {
    if (!restaurant) {
      adminProbe = { skipped: true, reason: "Tenant not resolved — can't look up an admin without a restaurantId." };
    } else {
      const admin = await prisma.adminUser.findFirst({
        where: { email, restaurantId: restaurant.id },
        select: { id: true, email: true, name: true, role: true },
      });
      adminProbe = admin
        ? { found: true, id: admin.id, email: admin.email, name: admin.name, role: admin.role }
        : { found: false, hint: "No admin with this email at this restaurant. Check the email exactly as it was created (lowercased on save) and confirm you're on the right subdomain." };
    }
  }

  // ─── 5. Optional real send ───────────────────────────────────────────────
  let sendProbe: Record<string, unknown> | null = null;
  if (attemptSend) {
    if (!email) {
      sendProbe = { skipped: true, reason: "Pass ?email=… to attempt a real send." };
    } else if (!resendConfigured) {
      sendProbe = { skipped: true, reason: "Resend not configured — RESEND_API_KEY or EMAIL_FROM missing." };
    } else if (!restaurant) {
      sendProbe = { skipped: true, reason: "Tenant not resolved." };
    } else if (!adminProbe || (adminProbe as { found?: boolean }).found !== true) {
      sendProbe = { skipped: true, reason: "Admin not found for this email at this tenant." };
    } else {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + RESET_TOKEN_LIFETIME_MINUTES * 60 * 1000);

      try {
        await prisma.adminPasswordResetToken.updateMany({
          where: { adminUserId: (adminProbe as { id: string }).id, usedAt: null },
          data: { usedAt: new Date() },
        });

        await prisma.adminPasswordResetToken.create({
          data: {
            adminUserId: (adminProbe as { id: string }).id,
            tokenHash,
            expiresAt,
          },
        });

        const baseUrl = await getRequestBaseUrl();
        const resetUrl = `${baseUrl}/admin/reset-password?token=${rawToken}`;

        const message = buildAdminPasswordResetEmail({
          adminName: (adminProbe as { name: string }).name || "there",
          restaurantName: restaurant.name,
          resetUrl,
          expiresInMinutes: RESET_TOKEN_LIFETIME_MINUTES,
        });

        const fromAddress = `${restaurant.name} <${env.EMAIL_FROM}>`;
        const client = new Resend(env.RESEND_API_KEY!);
        const result = await client.emails.send({
          from: fromAddress,
          to: (adminProbe as { email: string }).email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });

        if (result.error) {
          sendProbe = {
            attempted: true,
            success: false,
            from: fromAddress,
            to: (adminProbe as { email: string }).email,
            resendError: {
              name: result.error.name ?? null,
              message: result.error.message ?? String(result.error),
            },
          };
        } else {
          sendProbe = {
            attempted: true,
            success: true,
            from: fromAddress,
            to: (adminProbe as { email: string }).email,
            providerId: result.data?.id ?? null,
            resetUrlPreview: `${resetUrl.slice(0, 70)}…`,
            note: "Email handed to Resend successfully. Check the recipient inbox + spam, then verify the delivery record at https://resend.com/emails.",
          };
        }
      } catch (err) {
        sendProbe = {
          attempted: true,
          success: false,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        };
      }
    }
  }

  return NextResponse.json({
    tenant,
    resend,
    table: tableProbe,
    admin: adminProbe,
    send: sendProbe,
  });
}
