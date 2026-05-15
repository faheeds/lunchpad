"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

export function SiteHeader({
  restaurantName = "LunchPad",
  logoUrl = null,
}: {
  restaurantName?: string;
  /** Restaurant's uploaded logo URL (Vercel Blob). When null, falls back to
   *  the default LunchPad cloche SVG so the header always renders something. */
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const [menuOpen, setMenuOpen] = useState(false);
  // If the uploaded image fails to load (404, expired blob, etc.) we
  // swap to the SVG fallback. Tracked locally so a single bad URL doesn't
  // permanently break the brand.
  const [logoFailed, setLogoFailed] = useState(false);
  const showUploadedLogo = Boolean(logoUrl) && !logoFailed;

  return (
    <header className="app-header" style={{ flexDirection: "column", padding: 0, background: "var(--dark-bg)" }}>
      <a href="#main-content" style={{
        position: "absolute", left: "-9999px", top: 0,
        background: "var(--brand-on-dark)", color: "white",
        padding: "8px 16px", borderRadius: 4,
        textDecoration: "none", fontSize: 14, fontWeight: 600,
      }} onFocus={(e) => {
        e.currentTarget.style.left = "10px";
      }} onBlur={(e) => {
        e.currentTarget.style.left = "-9999px";
      }}>
        Skip to main content
      </a>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "11px 16px" }}>
        <Link href="/" className="no-underline flex items-center gap-2" onClick={() => setMenuOpen(false)}>
          {showUploadedLogo ? (
            // Plain <img> rather than next/image so any Vercel Blob host
            // works without a remotePatterns entry per restaurant.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl!}
              alt={`${restaurantName} logo`}
              onError={() => setLogoFailed(true)}
              style={{ width: 28, height: 28, borderRadius: 7, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="32" height="32" rx="7" fill="#c41230"/>
              <path d="M 4 19 A 12 10 0 0 1 28 19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="10" y1="5.5" x2="22" y2="5.5" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="16" y1="5.5" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <rect x="3" y="20.5" width="26" height="5.5" rx="2.75" fill="white"/>
            </svg>
          )}
          <p style={{ fontSize: 15, fontWeight: 700, color: "white", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {restaurantName}
          </p>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isAdmin ? (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "var(--brand-on-dark)", color: "white", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Staff
            </span>
          ) : (
            <>
              <Link href="/account" style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(var(--brand-rgb),0.85)", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "white",
                border: "1.5px solid rgba(var(--accent-rgb),0.4)", textDecoration: "none",
                fontFamily: "var(--font-display)"
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
        <nav style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.08)", background: "var(--dark-bg)", padding: "8px 12px 14px" }}>
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
              color: pathname === item.href ? "var(--accent-on-dark)" : "rgba(255,255,255,0.75)",
              background: pathname === item.href ? "rgba(var(--brand-on-dark-rgb),0.25)" : "transparent",
              textDecoration: "none", marginBottom: 2,
              fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.05em"
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
