"use client";

import { useEffect, useState } from "react";

export function SampleDataBanner({ slug }: { slug: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = `lp.sample-data-banner.dismissed.${slug}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(key)) {
      setDismissed(true);
    }
  }, [slug]);

  function handleDismiss() {
    if (typeof window !== "undefined") {
      const key = `lp.sample-data-banner.dismissed.${slug}`;
      window.localStorage.setItem(key, "1");
    }
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="rounded-[16px] bg-editorial-paper-2 border border-editorial-line px-5 py-3 flex items-center justify-between gap-3 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
      <div className="flex items-center gap-3 flex-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-green flex-shrink-0">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <p className="text-[13px] text-editorial-ink">
          <span className="font-semibold">We've added sample data</span> so you can explore. Replace it whenever you're ready.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="text-editorial-green hover:text-editorial-green-deep font-medium text-[12px] whitespace-nowrap transition"
      >
        Dismiss
      </button>
    </div>
  );
}
