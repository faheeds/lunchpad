"use client";

/**
 * /mobile-login?token=JWT
 *
 * Bridge page for the iOS Capacitor app. The app navigates the WebView here
 * after native Apple / Google sign-in. This page takes the short-lived
 * mobile JWT, signs in via the "mobile-token" NextAuth credentials provider,
 * and redirects to /account.
 *
 * The token is consumed once and has a 10-minute expiry, so replaying it is
 * harmless. The resulting NextAuth session cookie persists in WKWebView's
 * cookie store for subsequent app opens.
 *
 * useSearchParams() must be inside a <Suspense> boundary in Next.js 14+.
 */

import { Suspense, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const spinnerStyle: React.CSSProperties = {
  width: 48, height: 48, borderRadius: "50%",
  border: "3px solid rgba(245,158,11,0.25)",
  borderTopColor: "#f59e0b",
  animation: "spin 0.8s linear infinite",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  background: "#1c0505", gap: 16,
};

function MobileLoginInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    signIn("mobile-token", { token, callbackUrl: "/account", redirect: true });
  }, [token]);

  return (
    <div style={pageStyle}>
      <div style={spinnerStyle} />
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
        Signing you in…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function MobileLoginPage() {
  // Suspense boundary required by Next.js 14+ for useSearchParams()
  return (
    <Suspense fallback={
      <div style={pageStyle}>
        <div style={spinnerStyle} />
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
          Signing you in…
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <MobileLoginInner />
    </Suspense>
  );
}
