import * as Sentry from "@sentry/nextjs";

export interface LogContext {
  action?: string;
  restaurantId?: string;
  userId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

/**
 * Log structured JSON to stdout with optional Sentry integration.
 * Used for observability across server actions and API routes.
 */
export function logInfo(message: string, context: LogContext = {}) {
  const payload = {
    level: "info",
    message,
    ts: new Date().toISOString(),
    ...context,
  };
  console.log(JSON.stringify(payload));
}

export function logWarn(message: string, context: LogContext = {}) {
  const payload = {
    level: "warn",
    message,
    ts: new Date().toISOString(),
    ...context,
  };
  console.warn(JSON.stringify(payload));
}

export function logError(error: Error | unknown, context: LogContext = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  const payload = {
    level: "error",
    message: errorMessage,
    ts: new Date().toISOString(),
    ...context,
  };

  console.error(JSON.stringify(payload));

  if (Sentry.isInitialized()) {
    Sentry.captureException(error, {
      contexts: {
        action: {
          action: context.action,
          restaurantId: context.restaurantId,
          userId: context.userId,
          durationMs: context.durationMs,
        },
      },
    });
  }
}

/**
 * Helper to wrap a server action or API handler with timing and logging.
 * Records entry, duration, and exit. Errors are logged and re-thrown.
 */
export async function withTiming<T>(
  action: string,
  fn: () => Promise<T>,
  context: Omit<LogContext, "action" | "durationMs"> = {}
): Promise<T> {
  const startTime = Date.now();
  logInfo(`${action} started`, { action, ...context });

  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    logInfo(`${action} completed`, {
      action,
      durationMs,
      ...context,
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logError(error, {
      action,
      durationMs,
      ...context,
    });
    throw error;
  }
}
