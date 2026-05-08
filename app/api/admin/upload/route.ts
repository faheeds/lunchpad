/**
 * Server-side image upload to Vercel Blob.
 *
 * Browser POSTs a multipart/form-data with field `file`. We verify the admin
 * session, validate the file, and call put() server-to-server. Returns the
 * public URL. This avoids CORS / SDK-version issues with browser-direct
 * client uploads.
 *
 * Trade-off: subject to Vercel's 4.5MB function body limit. Adequate for
 * menu photos and logos. If we ever need 4.5MB+ uploads, switch this route
 * to handleUpload (client-direct) and live with the CORS-config dance.
 */

import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB — under Vercel's 4.5MB body cap
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * GET — diagnostics. /api/admin/upload?diagnose=1
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
  // Auth check
  const session = await auth();
  const adminUserId = session?.user?.adminUserId;
  const restaurantId = session?.user?.restaurantId;
  if (!adminUserId || !restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm admin/restaurant alignment
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, restaurantId: true },
  });
  if (!admin || admin.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Server misconfigured: BLOB_READ_WRITE_TOKEN not set" },
      { status: 500 }
    );
  }

  // Parse the multipart upload
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Use PNG, JPG, WebP, or GIF.` },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 400 }
    );
  }

  // Build a tenant-scoped pathname so blobs can't collide across restaurants
  const ext = file.name.split(".").pop() ?? "bin";
  const safeExt = /^[a-z0-9]{1,8}$/i.test(ext) ? ext : "bin";
  const random = Math.random().toString(36).slice(2, 10);
  const pathname = `restaurants/${restaurantId}/${Date.now()}-${random}.${safeExt}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false, // pathname already includes random component
    });
    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    console.error("[upload] blob put failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
