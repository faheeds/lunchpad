import { prisma } from "@/lib/db";

const EXPO_PUSH_URL =
  process.env.EXPO_PUSH_ENDPOINT ?? "https://exp.host/--/exponent/api/v2/push/send";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPushToParent(
  parentUserId: string,
  payload: PushPayload
): Promise<void> {
  const tokens = await prisma.pushToken.findMany({
    where: { parentUserId },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: "default",
  }));

  // v1 accepted: a throw on a failing batch skips remaining batches (only relevant for parents with >100 devices).
  const BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const batchTokens = tokens.slice(i, i + BATCH_SIZE).map((t) => t.token);

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      throw new Error(`Expo push failed: ${response.status}`);
    }

    const result = await response.json() as {
      data?: Array<{ status: string; message?: string; details?: { error?: string } }>;
      errors?: Array<{ code: string; message: string }>;
    };

    // Expo returns a top-level errors array for malformed requests (not per-token errors).
    // If present, result.data is undefined — throw so the caller's .catch(() => {}) records it.
    if (result.errors?.length) {
      throw new Error(`[push] Expo top-level error: ${result.errors[0].message}`);
    }

    const deadTokens: string[] = [];
    for (let j = 0; j < (result.data ?? []).length; j++) {
      const ticket = result.data![j];
      if (ticket.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered") {
          deadTokens.push(batchTokens[j]);
        } else {
          console.error("[push] Expo error:", ticket.message);
        }
      }
    }

    if (deadTokens.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: deadTokens } } });
    }
  }
}

export async function sendPushForOrder(
  orderId: string,
  payload: PushPayload
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { parentUserId: true },
  });
  if (!order?.parentUserId) return;
  return sendPushToParent(order.parentUserId, payload);
}
