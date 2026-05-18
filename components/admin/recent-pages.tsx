"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const BREADCRUMB_LABELS: Record<string, string> = {
  orders: "Orders",
  kitchen: "Kitchen",
  reports: "Reports",
  menu: "Menu",
  "delivery-dates": "Schedule",
  discounts: "Discounts",
  locations: "Locations",
  activity: "Activity",
  settings: "Settings",
  setup: "Setup",
  onboarding: "Onboarding",
  subscription: "Subscription",
  schools: "Locations",
  team: "Team",
};

interface RecentPage {
  label: string;
  href: string;
  visitedAt: number;
}

function getLabelFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 3) return pathname;

  const mainSegment = segments[2];
  return BREADCRUMB_LABELS[mainSegment] || mainSegment;
}

export function RecentPages() {
  const pathname = usePathname();
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Load from localStorage on mount
    try {
      const stored = localStorage.getItem("lunchpad-recent-admin-pages");
      if (stored) {
        setRecentPages(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, []);

  useEffect(() => {
    // Skip dashboard
    if (pathname === "/admin/dashboard") return;

    // Get label for current page
    const label = getLabelFromPath(pathname);

    // Update recent pages list
    setRecentPages((prev) => {
      const filtered = prev.filter((p) => p.href !== pathname);
      const updated = [
        { label, href: pathname, visitedAt: Date.now() },
        ...filtered,
      ].slice(0, 5);

      try {
        localStorage.setItem("lunchpad-recent-admin-pages", JSON.stringify(updated));
      } catch (e) {
        // Ignore localStorage errors
      }

      return updated;
    });
  }, [pathname]);

  if (recentPages.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-[12px] px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1"
        title="Recently visited pages"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
        </svg>
        Recent
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-0.5 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
          <div className="py-1">
            {recentPages.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                onClick={() => setIsOpen(false)}
                className="block px-4 py-2 text-[12px] text-slate-700 hover:bg-slate-50 no-underline transition"
              >
                {page.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
