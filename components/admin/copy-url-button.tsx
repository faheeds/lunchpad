"use client";

import { useState } from "react";

export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`px-3 py-2 rounded-full text-[12px] font-medium border transition ${
        copied
          ? "bg-editorial-sage border-editorial-green text-editorial-green"
          : "bg-white border-editorial-line text-editorial-ink-soft hover:text-editorial-ink"
      }`}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
