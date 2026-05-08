import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  },
  // Required for Sentry server-side instrumentation
  instrumentationHook: true,
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (set these once your Sentry project is created)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for uploading source maps (set in Vercel env vars as SENTRY_AUTH_TOKEN)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress the build output noise from Sentry
  silent: !process.env.CI,

  // Upload source maps to Sentry for better stack traces
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,

  // Automatically annotate React components for easier debugging
  reactComponentAnnotation: {
    enabled: true,
  },

  // Hide source maps from the client bundle
  hideSourceMaps: true,

  // Sentry's release-tagging API has been intermittently 504-ing during our
  // builds. The CLI subprocess crashes with unhandledRejection that the
  // errorHandler can't catch. Disabling the release lifecycle calls
  // (create/finalize) skips those API hits entirely while still uploading
  // source maps — runtime error reporting is unaffected, traces just won't
  // be tagged with a release version.
  release: {
    create: false,
    finalize: false,
  },

  // Catch anything else that might still throw during build (covers source-
  // map upload edge cases from Sentry's API).
  errorHandler: (err) => {
    // eslint-disable-next-line no-console
    console.warn("[sentry-build] non-fatal error:", err.message ?? err);
  },
});
