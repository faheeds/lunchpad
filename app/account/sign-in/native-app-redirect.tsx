"use client";

/**
 * NativeAppRedirect
 *
 * When the web app's sign-in page loads inside the iOS Capacitor WKWebView
 * (i.e. the NextAuth session expired while the user was in the app), this
 * component detects the native context, clears the stale stored token from
 * Capacitor Preferences, and navigates the WebView back to the local native
 * sign-in splash (www/index.html) so the user can re-authenticate natively.
 *
 * This prevents the user from accidentally going through the web-based
 * Apple / Google OAuth flow, which is not configured for mobile use.
 *
 * Capacitor injects window.Capacitor into every page the WKWebView loads,
 * so we can call native plugins here even though @capacitor/core is not
 * installed as a dependency of the web app.
 */

import { useEffect } from "react";

const TOKEN_KEY = "lbb_mobile_token";
const NATIVE_SPLASH = "capacitor://localhost/";

export function NativeAppRedirect() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    // Running inside the iOS app — session expired or cookie missing.
    // Clear the stored token so the splash's init() won't fast-path past
    // the sign-in screen on the next load, then reload the native splash.
    const clearAndRedirect = async () => {
      try {
        await cap.Plugins?.Preferences?.remove({ key: TOKEN_KEY });
      } catch {
        // Ignore — worst case init() will navigate back here once more,
        // but the token will be gone on that second attempt.
      }
      window.location.replace(NATIVE_SPLASH);
    };

    clearAndRedirect();
  }, []);

  // Renders nothing — this is purely a side-effect component.
  return null;
}
