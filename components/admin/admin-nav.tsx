"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { hasRole, type AdminRole } from "@/lib/roles";

const ALL_LINKS: { href: string; label: string; minRole: AdminRole }[] = [
  { href: "/admin/dashboard",      label: "Dashboard",    minRole: "STAFF"   },
  { href: "/admin/orders",         label: "Orders",       minRole: "STAFF"   },
  { href: "/admin/reports",        label: "Reports",      minRole: "MANAGER" },
  { href: "/admin/menu",           label: "Menu",         minRole: "MANAGER" },
  { href: "/admin/delivery-dates", label: "Schedule",     minRole: "MANAGER" },
  { href: "/admin/schools",        label: "Schools",      minRole: "OWNER"   },
  { href: "/admin/team",           label: "Team",         minRole: "OWNER"   },
  { href: "/admin/settings",       label: "Settings",     minRole: "OWNER"   },
  { href: "/admin/subscription",   label: "Subscription", minRole: "OWNER"   },
];

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  OWNER:   { label: "Owner",   color: "#7c3aed" },
  MANAGER: { label: "Manager", color: "#0369a1" },
  STAFF:   { label: "Staff",   color: "#374151" },
};

export function AdminNav({ adminRole }: { adminRole: string }) {
  const pathname = usePathname();
  const links = ALL_LINKS.filter((l) => hasRole(adminRole, l.minRole));
  const badge = ROLE_BADGE[adminRole] ?? ROLE_BADGE.STAFF;

  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between py-2.5 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <Link href="/admin/dashboard" className="no-underline flex items-center gap-2">
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                background: "linear-gradient(135deg, #c41230, #8b0d22)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "white" }}>L</span>
              </div>
              <span className="text-[13px] font-semibold text-ink">LunchPad</span>
            </Link>
            <span className="text-slate-200">|</span>
            <span className="text-[12px] text-slate-400">Admin</span>
            <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
              style={{ background: badge.color }}>
              {badge.label}
            </span>
          </div>
          <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="text-[11px] text-slate-500 border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-50 transition flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
        <div className="flex overflow-x-auto gap-0.5 py-1" style={{ scrollbarWidth: "none" }}>
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link key={link.href} href={link.href}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] no-underline transition whitespace-nowrap"
                style={{
                  background: active ? "#fff1f3" : "transparent",
                  color: active ? "#c41230" : "#64748b",
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
