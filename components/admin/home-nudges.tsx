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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <path d="M20 8v6M23 11h-6"/>
    </svg>
  ),
  notifications: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#854d0e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  test_order: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/>
      <circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  share_url: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
};

const BG_TONE: Record<NudgeKind, { bg: string; border: string; iconBg: string }> = {
  invite_team:    { bg: "#eff6ff", border: "#bfdbfe", iconBg: "#dbeafe" },
  notifications:  { bg: "#fef9c3", border: "#fde68a", iconBg: "#fef3c7" },
  test_order:     { bg: "#f5f3ff", border: "#ddd6fe", iconBg: "#ede9fe" },
  share_url:      { bg: "#ecfdf5", border: "#a7f3d0", iconBg: "#d1fae5" },
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2">
        Suggested next steps
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((n) => {
          const tone = BG_TONE[n.kind];
          return (
            <div
              key={n.kind}
              style={{
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                borderRadius: 14,
                padding: "12px 14px",
                display: "flex",
                gap: 12,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: tone.iconBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {ICONS[n.kind]}
              </div>
              <div className="flex-1 min-w-0 pr-5">
                <p className="text-[13px] font-semibold text-ink leading-tight">{n.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.body}</p>
                <Link
                  href={n.ctaHref}
                  className="inline-block mt-2 text-[12px] font-semibold text-brand-700 no-underline"
                >
                  {n.ctaText} →
                </Link>
              </div>
              <button
                type="button"
                onClick={() => handleDismiss(n.kind)}
                aria-label="Dismiss"
                style={{
                  position: "absolute", top: 8, right: 8,
                  width: 20, height: 20, padding: 0,
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "#94a3b8", fontSize: 16, lineHeight: 1,
                }}
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
