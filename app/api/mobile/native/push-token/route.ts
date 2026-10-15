import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireMobileAuth,
  options as corsOptions,
  jsonOk,
  jsonErr,
} from "@/lib/mobile-bearer";

export { corsOptions as OPTIONS };

export async function POST(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);
    const body = await request.json();
    const { token, platform } = body;

    if (!token || typeof token !== "string") {
      return jsonErr("token is required", 400);
    }
    if (platform !== "ios" && platform !== "android") {
      return jsonErr("platform must be ios or android", 400);
    }

    // An Expo push token identifies one physical device. If the same device
    // was previously registered under another parent account (switching
    // accounts, a second restaurant/tenant login, a test account), drop those
    // rows -- otherwise every push to either account lands on this device
    // and shows up as an identical duplicate notification.
    await prisma.pushToken.deleteMany({
      where: { token, parentUserId: { not: auth.parentUserId } },
    });

    await prisma.pushToken.upsert({
      where: { parentUserId_token: { parentUserId: auth.parentUserId, token } },
      create: { parentUserId: auth.parentUserId, token, platform },
      update: { updatedAt: new Date() },
    });

    return jsonOk({ ok: true });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to register push token.";
    return jsonErr(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireMobileAuth(request);
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return jsonErr("token is required", 400);
    }

    await prisma.pushToken.deleteMany({
      where: { parentUserId: auth.parentUserId, token },
    });

    return jsonOk({ ok: true });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Failed to unregister push token.";
    return jsonErr(message, status);
  }
}
