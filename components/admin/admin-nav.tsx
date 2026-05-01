"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { hasRole, type AdminRole } from "@/lib/admin-auth";

const ALL_LINKS: { href: string; label: string; minRole: AdminRole }[] = [
  { href: "/admin/dashboard",      label: "Dashboard", minRole: "STAFF"   },
  { href: "/admin/orders",         label: "Orders",    minRole: "STAFF"   },
  { href: "/admin/delivery-dates", label: "Dates",     minRole: "MANAGER" },
  { href: "/admin/menu",           label: "Menu",      minRole: "MANAGER" },
  { href: "/admin/reports",        label: "Reports",   minRole: "MANAGER" },
  { href: "/admin/schools",        label: "Schools",   minRole: "OWNER"   },
  { href: "/admin/settings",       label: "Settings",  minRole: "OWNER"   },
  { href: "/admin/team",           label: "Team",      minRole: "OWNER"   },
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
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-700">LunchPad</span>
            <span className="text-slate-200">|</span>
            <span className="text-[13px] font-semibold text-ink">Admin</span>
            <span className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
              style={{ background: badge.color }}>
              {badge.label}
            </span>
          </div>
          <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="text-[11px] text-slate-500 border border-slate-200 rounded-full px-3 py-1 hover:bg-slate-50 transition flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"