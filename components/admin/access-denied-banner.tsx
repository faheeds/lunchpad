"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Shown on the dashboard after requireAdminRole() redirects a user away
 * from a page/nav item their role doesn't allow. Previously that redirect
 * carried no explanation at all -- clicking a restricted nav item just
 * silently bounced back to the dashboard with no visible reaction, which
 * read as a broken link rather than a permissions wall.
 */
export function AccessDeniedBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const denied = params.get("denied") === "1";

  if (!denied) return null;

  function dismiss() {
    const next = new URLSearchParams(params.toString());
    next.delete("denied");
    const qs = next.toString();
    router.replace(qs ? `/admin/dashboard?${qs}` : "/admin/dashboard");
  }

  return (
    <div className="rounded-[16px] bg-[#F4E3DB] border border-[#E2C3B3] px-5 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3D24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-[13px] text-[#7C3D24]">
          <span className="font-semibold">You don&apos;t have access to that page.</span>{" "}
          Your role doesn&apos;t include it — ask an Owner or Manager if you need it.
        </p>
      </div>
      <button
        onClick={dismiss}
        className="text-[#7C3D24] hover:opacity-70 font-medium text-[12px] whitespace-nowrap transition"
      >
        Dismiss
      </button>
    </div>
  );
}
