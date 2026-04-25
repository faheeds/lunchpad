"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="app-header" style={{ flexDirection: "column", padding: 0, background: "#1c0505" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "11px 16px" }}>
        <Link href="/" className="no-underline" onClick={() => setMenuOpen(false)}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#f59e0b", marginBottom: 1, fontFamily: "var(--font-oswald)" }}>
            Local Bigger Burger
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: "white", fontFamily: "var(--font-oswald)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Medina Academy Hot Lunch
          </p>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isAdmin ? (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "#c41230", color: "white", fontFamily: "var(--font-oswald)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Staff
            </span>
          ) : (
            <>
              <Link href="/account" style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(196,18,48,0.85)", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "white",
                border: "1.5px solid rgba(245,158,11,0.4)", textDecoration: "none",
                fontFamily: "var(--font-oswald)"
              }}>
                SM
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.08)", display: "flex",
                  flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 4, cursor: "pointer"
                }}
                aria-label="Menu"
              >
                <span style={{ display: "block", width: 14, height: 1.5, background: "white", borderRadius: 2 }} />
                <span style={{ display: "block", width: 14, height: 1.5, background: "white", borderRadius: 2 }} />
                <span style={{ display: "block", width: 14, height: 1.5, background: "white", borderRadius: 2 }} />
              </button>
            </>
          )}
        </div>
      </div>

      {menuOpen && !isAdmin && (
        <nav style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#1c0505", padding: "8px 12px 14px" }}>
          {[
            { href: "/",        label: "Home"          },
            { href: "/menu",    label: "Menu"          },
            { href: "/order",   label: "Order lunch"   },
            { href: "/weekly",  label: "Weekly plan"   },
            { href: "/history", label: "Order history" },
            { href: "/account", label: "My account"    },
            { href: "/contact", label: "Contact us"    },
          ].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} style={{
              display: "block", padding: "11px 14px", borderRadius: 10,
              fontSize: 14, fontWeight: pathname === item.href ? 700 : 500,
              color: pathname === item.href ? "#f59e0b" : "rgba(255,255,255,0.75)",
              background: pathname === item.href ? "rgba(196,18,48,0.35)" : "transparent",
              textDecoration: "none", marginBottom: 2,
              fontFamily: "var(--font-oswald)", textTransform: "uppercase", letterSpacing: "0.05em"
            }}>
              {item.label}
            </Link>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 8, paddingTop: 8 }}>
            <Link href="/admin/login" onClick={() => setMenuOpen(false)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 10, fontSize: 13,
              fontWeight: 500, color: "rgba(255,255,255,0.4)", textDecoration: "none"
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Admin login
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
