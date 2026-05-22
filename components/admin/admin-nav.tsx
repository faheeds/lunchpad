"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { hasRole, type AdminRole } from "@/lib/roles";
import { AdminSearch } from "@/components/admin/admin-search";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { RecentPagesDropdown } from "@/components/admin/recent-pages-dropdown";

function ClocheMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="9" fill="#2C4031"/><g transform="translate(6.4 5.6) scale(0.8)" fill="none" stroke="#F6F1E6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M3 12a9 9 0 0 0 18 0"/><path d="M12 7v-2"/><path d="M9 5h6"/></g></svg>
  );
}

// Top-level nav. Team and Subscription used to be their own entries,
// but they're now sub-tabs of Settings — see components/admin/settings-tabs.tsx.
// One Settings tab in the top nav, sub-tabs inside the Settings area.
const ALL_LINKS: { href: string; label: string; minRole: AdminRole }[] = [
  { href: "/admin/dashboard",      label: "Dashboard",    minRole: "STAFF"   },
  { href: "/admin/orders",         label: "Orders",       minRole: "STAFF"   },
  { href: "/admin/kitchen",        label: "Kitchen",      minRole: "STAFF"   },
  { href: "/admin/reports",        label: "Reports",      minRole: "MANAGER" },
  { href: "/admin/menu",           label: "Menu",         minRole: "MANAGER" },
  { href: "/admin/delivery-dates", label: "Schedule",     minRole: "MANAGER" },
  // Discounts — slots between Menu (what you sell) and Locations (where).
  // MANAGER+ so finance/promo decisions stay scoped above frontline staff.
  { href: "/admin/discounts",      label: "Discounts",    minRole: "MANAGER" },
  { href: "/admin/locations",      label: "Locations",    minRole: "OWNER"   },
  // Activity log — STAFF+ for transparency. Was kept near Team; now it's
  // adjacent to Settings since Team moved inside Settings.
  { href: "/admin/activity",       label: "Activity",     minRole: "STAFF"   },
  { href: "/admin/settings",       label: "Settings",     minRole: "OWNER"   },
];

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  OWNER:   { label: "Owner",   color: "#2C4031" },
  MANAGER: { label: "Manager", color: "#C0673E" },
  STAFF:   { label: "Staff",   color: "#5B5446" },
};

export function AdminNav({
  adminRole,
  restaurantSlug,
  onboardingPill,
}: {
  adminRole: string;
  restaurantSlug?: string;
  onboardingPill?: { done: number; total: number } | null;
}) {
  const pathname = usePathname();
  const [urlCopied, setUrlCopied] = useState(false);
  const links = ALL_LINKS.filter((l) => hasRole(adminRole, l.minRole));
  const badge = ROLE_BADGE[adminRole] ?? ROLE_BADGE.STAFF;
  const orderingUrl = restaurantSlug ? `https://${restaurantSlug}.lunchpad.us` : null;

  function copyUrl() {
    if (!orderingUrl) return;
    navigator.clipboard.writeText(orderingUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }).catch(() => {
      const el = document.createElement("textarea");
      el.value = orderingUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }

  return (
    <header className="bg-white border-b border-editorial-line sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between py-2.5 border-b border-editorial-line gap-4">
          <div className="flex items-center gap-2">
            <Link href="/admin/dashboard" className="no-underline flex items-center gap-2">
              <ClocheMark size={22} />
              <span className="font-editorial text-[15px] font-semibold text-editorial-ink">LunchPad</span>
            </Link>
            <span className="text-editorial-line">|</span>
            <span className="text-[12px] text-editorial-ink-faint">Admin</span>
            <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
              style={{ background: badge.color }}>
              {badge.label}
            </span>
          </div>
          <AdminSearch />
          <RecentPagesDropdown />
          <div className="flex items-center gap-2">
            {onboardingPill && (
              <Link
                href="/admin/onboarding"
                className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full no-underline transition"
                style={{
                  background: "#F6EED9",
                  color: "#6E5C2C",
                  border: "1px solid #E5D6A8",
                }}
                title="Continue setup"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Setup {onboardingPill.done}/{onboardingPill.total}
              </Link>
            )}
            {orderingUrl && (
              <button
                type="button"
                onClick={copyUrl}
                title="Copy your ordering URL"
                className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition"
                style={{
                  borderColor: urlCopied ? "#2C4031" : "#C9D2BC",
                  background: "#EDF0E4",
                  color: "#2C4031",
                }}>
                {urlCopied ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    {restaurantSlug}.lunchpad.us
                  </>
                )}
              </button>
            )}
            <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })}
              className="text-[11px] text-editorial-ink-soft border border-editorial-line rounded-full px-3 py-1 hover:bg-editorial-paper transition flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
        <div className="flex overflow-x-auto gap-0.5 py-1" style={{ scrollbarWidth: "none" }}>
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link key={link.href} href={link.href}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] no-underline transition whitespace-nowrap"
                style={{
                  background: active ? "rgba(44,64,49,0.08)" : "transparent",
                  color: active ? "#2C4031" : "#5B5446",
                  fontWeight: active ? 600 : 400,
                }}>
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
