"use client";

import { useEffect, useState } from "react";

export function SampleDataBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem("dismissSampleDataBanner") === "1";
    setIsVisible(!isDismissed);
  }, []);

  if (!isVisible) return null;

  const handleDismiss = () => {
    localStorage.setItem("dismissSampleDataBanner", "1");
    setIsVisible(false);
  };

  return (
    <div className="rounded-[12px] bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-[13px] font-semibold text-blue-900">Sample data loaded</p>
        <p className="text-[12px] text-blue-700 mt-0.5">We've added sample data so you can explore. Replace it whenever you're ready.</p>
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-blue-600 hover:text-blue-800 text-[12px] font-medium transition"
      >
        Dismiss
      </button>
    </div>
  );
}
