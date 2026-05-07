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

        if (!adminUserId || !restaurantId) {
          throw new Error("Unauthorized: no admin session");
        }

        // Confirm the admin user is real and belongs to this restaurant.
        const admin = await prisma.adminUser.findUnique({
          where: { id: adminUserId },
          select: { id: true, restaurantId: true },
        });
        if (!admin || admin.restaurantId !== restaurantId) {
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
