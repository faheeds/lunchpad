"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Settings tab bar — shown above every Settings-area page so the
 * group reads as one cohesive section even though the underlying
 * pages live at different routes.
 *
 * Why mixed routes vs. one big page: keeping /admin/team and
 * /admin/subscription as standalone routes preserves their existing
 * server actions and revalidation paths. Folding their content into
 * one giant /admin/settings page would touch 3000+ lines for no
 * functional gain. The shared tab bar is the consolidation users
 * see; the file structure stays cleanly modular.
 */
type Tab = {
  id: string;
  label: string;
  /** Either a route (used by Team / Plan which are their own pages)
   *  or a `?tab=...` query (used by the in-page tabs on /admin/settings). */
  href: string;
  /** When true, "active" is decided by pathname startsWith; otherwise
   *  active is decided by the `?tab=` query on the current pathname. */
  routeMatch?: boolean;
};

const TABS: Tab[] = [
  { id: "general",       label: "General",       href: "/admin/settings?tab=general" },
  { id: "branding",      label: "Branding",      href: "/admin/settings?tab=branding" },
  { id: "domain",        label: "Domain",        href: "/admin/settings?tab=domain" },
  { id: "payments",      label: "Payments",      href: "/admin/settings?tab=payments" },
  { id: "notifications", label: "Notifications", href: "/admin/settings?tab=notifications" },
  // Team and Plan are their own routes (legacy pages we're keeping in
  // place), but rendered under the same Settings umbrella here.
  { id: "team",          label: "Team",          href: "/admin/team",         routeMatch: true },
  { id: "plan",          label: "Plan",          href: "/admin/subscription", routeMatch: true },
  { id: "danger",        label: "Danger",        href: "/admin/settings?tab=danger" },
];

// Kept exported for compatibility with anything importing it elsewhere;
// the in-page tabs on settings/page.tsx use these IDs to decide which
// panel to render.
export type SettingsTabId = "general" | "branding" | "domain" | "payments" | "notifications" | "danger";

export function SettingsTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");

  // Active-tab resolution:
  //  - If we're on a routeMatch tab's path (e.g. /admin/team), that wins.
  //  - Otherwise we're on /admin/settings and the `?tab=` query decides;
  //    default to "general".
  const activeId = (() => {
    const routeTab = TABS.find((t) => t.routeMatch && pathname.startsWith(t.href.split("?")[0]));
    if (routeTab) return routeTab.id;
    return tabParam ?? "general";
  })();

  return (
    <div className="border-b border-slate-200 -mx-1">
      <div className="flex gap-1 px-1 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`px-3 py-2.5 text-[12px] font-semibold whitespace-nowrap border-b-2 transition no-underline ${
                isActive
                  ? "border-brand-700 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
