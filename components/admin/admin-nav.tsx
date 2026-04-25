"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/admin/dashboard",      label: "Dashboard" },
  { href: "/admin/orders",         label: "Orders" },
  { href: "/admin/reports",        label: "Reports" },
  { href: "/admin/menu",           label: "Menu" },
  { href: "/admin/schools",        label: "Schools" },
  { href: "/admin/delivery-dates", label: "Dates" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between py-2.5 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-700">LBB</span>
            <span className="text-slate-200">|</span>
            <span className="text-[13px] font-semibold text-ink">Admin</span>
            <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-ink text-white">Staff</span>
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
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] no-underline transition whitespace-nowrap"
                style={{ background: active ? "#f0fdf4" : "transparent", color: active ? "#15803d" : "#64748b", fontWeight: active ? 600 : 400 }}>
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
