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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-editorial-paper border-t-2 border-editorial-line px-4 py-4 sm:px-6 md:py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <p className="text-sm text-editorial-ink mb-2">
              <span className="font-semibold">Cookies & Your Privacy</span>
            </p>
            <p className="text-xs text-editorial-ink-soft leading-relaxed">
              We use cookies to remember your preferences and improve your experience. Please review our{" "}
              <Link href="/privacy" className="text-editorial-green hover:text-editorial-green-deep underline">
                privacy policy
              </Link>
              {" "}to learn more about how we handle your data.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="mt-3 flex-shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-full bg-editorial-green text-editorial-paper text-sm font-semibold hover:bg-editorial-green-deep transition-colors whitespace-nowrap"
            aria-label="Dismiss cookie notice"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
