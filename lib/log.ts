import * as Sentry from "@sentry/nextjs";

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  restaurantId?: string;
  orderId?: string;
  parentUserId?: string;
  deliveryDateId?: string;
  schoolId?: string;
  [key: string]: unknown;
}

/**
 * Emit a structured log line with level, event name, and context.
 * Integrates with Sentry for error tracking.
 */
export function log(level: LogLevel, event: string, context: LogContext = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = JSON.stringify({ timestamp, level, event, context });

  switch (level) {
    case "info":
      console.log(logMessage);
      break;
    case "warn":
      console.warn(logMessage);
      break;
    case "error":
      console.error(logMessage);
      // Capture error-level events in Sentry with the context
      Sentry.captureMessage(event, {
        level: "error",
        tags: { event },
        extra: context,
      });
      break;
  }
}

/**
 * Log at info level
 */
export function logInfo(event: string, context?: LogContext) {
  log("info", event, context);
}

/**
 * Log at warn level
 */
export function logWarn(event: string, context?: LogContext) {
  log("warn", event, context);
}

/**
 * Log at error level with Sentry integration
 */
export function logError(event: string, context?: LogContext) {
  log("error", event, context);
}

/**
 * Log an exception with context
 */
export function logException(error: unknown, event: string, context: LogContext = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const errorContext = {
    ...context,
    errorMessage: message,
    errorType: error instanceof Error ? error.constructor.name : typeof error,
  };

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event,
      context: errorContext,
    })
  );

  // Capture exception in Sentry
  if (error instanceof Error) {
    Sentry.captureException(error, {
      tags: { event },
      extra: errorContext,
    });
  } else {
    Sentry.captureMessage(event, {
      level: "error",
      tags: { event },
      extra: errorContext,
    });
  }
}
