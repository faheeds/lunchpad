"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Home-page nudge banners — the "soft" replacement for blocking
 * onboarding steps.
 *
 * Background: the 5-group onboarding wizard collapsed several
 * concerns (team invites, notifications, test order, sharing the URL)
 * into a single "Go live" group. Some operators race through that
 * group and skip the optional bits; the nudges below resurface them
 * on Home until the operator either does them or dismisses them.
 *
 * Server-side: dashboard/page.tsx computes which nudges have their
 * "condition" met (e.g., no team members yet → show invite nudge)
 * and passes them in.
 *
 * Client-side: this component layers in a "dismissed" filter from
 * localStorage so a banner doesn't reappear once the operator says
 * "not now". Dismissal is per-tenant (keyed by slug) so changing
 * tenants doesn't carry over.
 */

export type NudgeKind =
  | "invite_team"
  | "notifications"
  | "test_order"
  | "share_url";

export interface Nudge {
  kind: NudgeKind;
  title: string;
  body: string;
  ctaText: string;
  ctaHref: string;
}

const ICONS: Record<NudgeKind, React.ReactNode> = {
  invite_team: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-green">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <path d="M20 8v6M23 11h-6"/>
    </svg>
  ),
  notifications: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6E5C2C]">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  test_order: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-clay">
      <circle cx="9" cy="21" r="1"/>
      <circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  share_url: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-editorial-green">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
};

const BG_TONE: Record<NudgeKind, { bg: string; border: string; iconBg: string; textBg: string }> = {
  invite_team:    { bg: "bg-white", border: "border-editorial-line", iconBg: "bg-editorial-paper-2", textBg: "text-editorial-ink" },
  notifications:  { bg: "bg-white", border: "border-editorial-line", iconBg: "bg-[#F6EED9]", textBg: "text-editorial-ink" },
  test_order:     { bg: "bg-white", border: "border-editorial-line", iconBg: "bg-editorial-paper-2", textBg: "text-editorial-ink" },
  share_url:      { bg: "bg-white", border: "border-editorial-line", iconBg: "bg-editorial-sage", textBg: "text-editorial-ink" },
};

function dismissKey(slug: string, kind: NudgeKind) {
  return `lp.nudge.dismissed.${slug}.${kind}`;
}

export function HomeNudges({ nudges, slug }: { nudges: Nudge[]; slug: string }) {
  // Track which nudges the operator has dismissed in this browser.
  // Starts empty server-side then hydrates from localStorage to avoid
  // a hydration mismatch flash. The server already filtered nudges by
  // "condition still active" so the only thing left to do client-side
  // is filter out dismissed ones.
  const [dismissed, setDismissed] = useState<Set<NudgeKind>>(new Set());

  useEffect(() => {
    const next = new Set<NudgeKind>();
    for (const n of nudges) {
      if (typeof window !== "undefined" && window.localStorage.getItem(dismissKey(slug, n.kind))) {
        next.add(n.kind);
      }
    }
    setDismissed(next);
  }, [nudges, slug]);

  const visible = nudges.filter((n) => !dismissed.has(n.kind));
  if (visible.length === 0) return null;

  function handleDismiss(kind: NudgeKind) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(dismissKey(slug, kind), "1");
    }
    setDismissed((cur) => new Set(cur).add(kind));
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-ink-faint mb-2">
        Suggested next steps
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((n) => {
          const tone = BG_TONE[n.kind];
          return (
            <div
              key={n.kind}
              className={`${tone.bg} border ${tone.border} rounded-[16px] p-4 flex gap-3 relative shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]`}
            >
              <div className={`w-9 h-9 rounded-[10px] flex-shrink-0 ${tone.iconBg} flex items-center justify-center`}>
                {ICONS[n.kind]}
              </div>
              <div className="flex-1 min-w-0 pr-5">
                <p className={`text-[13px] font-semibold font-editorial ${tone.textBg} leading-tight`}>{n.title}</p>
                <p className="text-[11px] text-editorial-ink-soft mt-0.5 leading-snug">{n.body}</p>
                <Link
                  href={n.ctaHref}
                  className="inline-block mt-2 text-[12px] font-bold text-editorial-green no-underline hover:text-editorial-green-deep transition"
                >
                  {n.ctaText} →
                </Link>
              </div>
              <button
                type="button"
                onClick={() => handleDismiss(n.kind)}
                aria-label="Dismiss"
                className="absolute top-3 right-3 w-5 h-5 p-0 bg-transparent border-none cursor-pointer text-editorial-ink-faint text-base leading-none hover:text-editorial-ink transition"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
