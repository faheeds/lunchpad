"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#f8fafc",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: 32, marginBottom: 8 }}>😕</p>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24, textAlign: "center" }}>
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "#c41230",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
