import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Lower sample rate for edge (middleware runs on every request)
  tracesSampleRate: 0.05,

  debug: false,
});
