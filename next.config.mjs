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
});
