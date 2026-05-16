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
    <div className="rounded-[12px] bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <p className="text-[13px] text-blue-800">
          <span className="font-semibold">We've added sample data</span> so you can explore. Replace it whenever you're ready.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="text-blue-600 hover:text-blue-800 font-medium text-[12px] whitespace-nowrap"
      >
        Dismiss
      </button>
    </div>
  );
}
