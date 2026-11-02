"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CookieNotice() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the notice before
    const isDismissed = localStorage.getItem("cookie-notice-dismissed");
    if (!isDismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("cookie-notice-dismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-0 left-0 right-0 z-40 bg-editorial-paper border-t border-editorial-line px-3 py-2 sm:px-6"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <p className="flex-1 text-xs leading-snug text-editorial-ink-soft">
          We use cookies to remember your preferences.{" "}
          <Link href="/privacy" className="text-editorial-green hover:text-editorial-green-deep underline">
            Privacy policy
          </Link>
        </p>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 inline-flex items-center justify-center px-3 py-1 rounded-full bg-editorial-green text-editorial-paper text-xs font-semibold hover:bg-editorial-green-deep transition-colors whitespace-nowrap"
          aria-label="Dismiss cookie notice"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
