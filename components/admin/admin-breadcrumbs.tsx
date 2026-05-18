"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

interface Crumb {
  label: string;
  href: string;
}

function getBreadcrumbs(pathname: string): Crumb[] {
  // Don't show breadcrumbs on dashboard (it's the root)
  if (pathname === "/admin/dashboard") {
    return [];
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  // Add Admin root
  crumbs.push({ label: "Admin", href: "/admin/dashboard" });

  // Process path segments
  let currentPath = "";
  for (let i = 2; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    const segment = segments[i];

    // Check if this looks like an ID (UUID or numeric)
    if (segment.match(/^[a-f0-9\-]+$/) || /^\d+$/.test(segment)) {
      // This is an ID, might need special handling
      // For now, just add it with "#" prefix
      crumbs.push({ label: `#${segment.slice(0, 8)}`, href: `/admin${currentPath}` });
    } else {
      const label = BREADCRUMB_LABELS[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
      crumbs.push({ label, href: `/admin${currentPath}` });
    }
  }

  return crumbs;
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600">
      {crumbs.map((crumb, idx) => (
        <div key={crumb.href} className="flex items-center gap-1">
          {idx > 0 && <span className="text-slate-300">/</span>}
          {idx === crumbs.length - 1 ? (
            <span className="text-slate-700 font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="text-slate-600 hover:text-slate-900 no-underline transition">
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
