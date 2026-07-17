"use client";

import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingBag, CalendarDays, Receipt, CircleUserRound } from "lucide-react";

const navItems = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/menu", label: "Menu", Icon: UtensilsCrossed },
  { href: "/order", label: "Order", Icon: ShoppingBag },
  { href: "/weekly", label: "Weekly", Icon: CalendarDays },
  { href: "/history", label: "History", Icon: Receipt },
  { href: "/account", label: "Account", Icon: CircleUserRound },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-bnav">
      {navItems.map((item) => {
        const active = pathname === item.href;
        const color = active ? "var(--brand-hex)" : "rgba(255,255,255,0.35)";
        return (
          <a key={item.href} href={item.href}
            className="flex-1 flex flex-col items-center gap-1 py-2 no-underline">
            <item.Icon width={20} height={20} strokeWidth={1.75} color={color} />
            <span className="text-[11px] font-semibold transition-colors"
              style={{ color, fontFamily: "var(--font-body, var(--font-inter)), system-ui, sans-serif" }}>
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
