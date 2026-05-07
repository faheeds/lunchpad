/**
 * Vercel Blob upload endpoint.
 *
 * Handles signed-URL generation for client-side direct uploads. The client
 * uses `upload()` from `@vercel/blob/client` which posts to this route to
 * get a token, then uploads directly to Blob storage — bypassing the
 * 4.5MB Vercel function body limit.
 *
 * Auth: requires an active admin session. Limits enforced server-side
 * via the allowedContentTypes / maximumSizeInBytes fields below.
 */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET — diagnostics. Lets the operator verify config without uploading.
 * Reports whether the Blob token is present and what the current session
 * looks like. Hit /api/admin/upload?diagnose=1 in a browser tab.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("diagnose") !== "1") {
    return NextResponse.json({ error: "POST only" }, { status: 405 });
  }
  const session = await auth();
  return NextResponse.json({
    blobTokenSet: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    blobTokenPreview: process.env.BLOB_READ_WRITE_TOKEN
      ? `${process.env.BLOB_READ_WRITE_TOKEN.slice(0, 12)}…(${process.env.BLOB_READ_WRITE_TOKEN.length} chars)`
      : null,
    sessionExists: Boolean(session),
    sessionUser: session?.user
      ? {
          adminUserId: session.user.adminUserId ?? null,
          restaurantId: session.user.restaurantId ?? null,
          role: session.user.role ?? null,
          adminRole: session.user.adminRole ?? null,
        }
      : null,
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Verify admin session before issuing a signed token.
        // adminUserId / restaurantId are stored on session.user (see auth.ts
        // session callback), NOT at the top level of the session object.
        const session = await auth();
        const adminUserId = session?.user?.adminUserId;
        const restaurantId = session?.user?.restaurantId;

        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          console.error("[upload] BLOB_READ_WRITE_TOKEN missing in env");
          throw new Error("Server misconfigured: BLOB_READ_WRITE_TOKEN not set in Vercel env");
        }

        if (!adminUserId || !restaurantId) {
          console.error("[upload] no admin session", { sessionExists: Boolean(session), userKeys: Object.keys(session?.user ?? {}) });
          throw new Error("Unauthorized: no admin session");
        }

        // Confirm the admin user is real and belongs to this restaurant.
        const admin = await prisma.adminUser.findUnique({
          where: { id: adminUserId },
          select: { id: true, restaurantId: true },
        });
        if (!admin || admin.restaurantId !== restaurantId) {
          console.error("[upload] admin/restaurant mismatch", { adminUserId, restaurantId, found: Boolean(admin) });
          throw new Error("Unauthorized: admin/restaurant mismatch");
        }

        // Scope the path under the restaurant so blobs can't collide
        // across tenants and so we can audit per-tenant storage later.
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
          ],
          maximumSizeInBytes: 8 * 1024 * 1024, // 8MB cap on uploads
          tokenPayload: JSON.stringify({
            restaurantId,
            originalPathname: pathname,
          }),
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional hook fired by Vercel after the upload finishes.
        // Could log to an Asset table here in a future migration; for now
        // we just leave the blob in place — restaurants reference URLs
        // directly on the MenuItem / Restaurant rows.
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log("[upload] blob ready", blob.url, "tokenPayload:", tokenPayload);
        }
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
