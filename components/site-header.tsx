"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { HelpDrawer } from "./help-drawer";

export function SiteHeader({
  restaurantName = "LunchPad",
  logoUrl = null,
  isSignedIn = false,
  userName = null,
  userEmail = null,
}: {
  restaurantName?: string;
  /** Restaurant's uploaded logo URL (Vercel Blob). When null, falls back to
   *  the default LunchPad cloche SVG so the header always renders something. */
  logoUrl?: string | null;
  isSignedIn?: boolean;
  userName?: string | null;
  userEmail?: string | null;
}) {
  const getInitials = (name: string | null | undefined): string => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((word) => word[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const [menuOpen, setMenuOpen] = useState(false);
  // If the uploaded image fails to load (404, expired blob, etc.) we
  // swap to the SVG fallback. Tracked locally so a single bad URL doesn't
  // permanently break the brand.
  const [logoFailed, setLogoFailed] = useState(false);
  const showUploadedLogo = Boolean(logoUrl) && !logoFailed;

  return (
    <header className="app-header" style={{ flexDirection: "column", padding: 0, background: "#F6F1E6" }}>
      <a href="#main-content" style={{
        position: "absolute",
        left: "-9999px",
        zIndex: 999,
        padding: "8px 12px",
        background: "#2C4031",
        color: "#F6F1E6",
        textDecoration: "none",
        borderRadius: 4,
      }} onFocus={(e) => {
        e.currentTarget.style.left = "16px";
        e.currentTarget.style.top = "16px";
      }} onBlur={(e) => {
        e.currentTarget.style.left = "-9999px";
      }}>
        Skip to main content
      </a>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 16px" }}>
        <Link href="/" className="no-underline flex items-center gap-2" onClick={() => setMenuOpen(false)}>
          {showUploadedLogo ? (
            // Plain <img> rather than next/image so any Vercel Blob host
            // works without a remotePatterns entry per restaurant.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl!}
              alt={`${restaurantName} logo`}
              width={28}
              height={28}
              onError={() => setLogoFailed(true)}
              style={{ width: 28, height: 28, borderRadius: 7, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#2C4031"/><g transform="translate(6.4 5.6) scale(0.8)" fill="none" stroke="#F6F1E6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M3 12a9 9 0 0 0 18 0"/><path d="M12 7v-2"/><path d="M9 5h6"/></g></svg>
          )}
          <p style={{ fontSize: 16, fontWeight: 600, color: "#211D15", fontFamily: "Fraunces, Georgia, serif", textTransform: "uppercase", letterSpacing: "0.02em" }}>
            {restaurantName}
          </p>
        </Link>

        {/* Desktop nav: hidden below 1024px */}
        <nav style={{ display: "none", alignItems: "center", gap: 24, "@media (min-width: 1024px)": { display: "flex" } } as any}
          className="desktop-nav">
          {!isAdmin && [
            { href: "/menu", label: "Menu" },
            { href: "/order", label: "Order" },
            { href: "/weekly", label: "Weekly" },
            { href: "/history", label: "History" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{
              fontSize: 14, fontWeight: 600, color: "#211D15",
              textDecoration: "none", fontFamily: "Fraunces, Georgia, serif",
              textTransform: "uppercase", letterSpacing: "0.02em",
            }}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isAdmin ? (
            <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "#2C4031", color: "#F6F1E6", fontFamily: "Fraunces, Georgia, serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Staff
            </span>
          ) : (
            <>
              <HelpDrawer />
              {isSignedIn ? (
                <Link href="/account" aria-label="Go to account" style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#DEE2CF", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "#2C4031",
                  border: "none", textDecoration: "none",
                  fontFamily: "Fraunces, Georgia, serif"
                }}>
                  {getInitials(userName)}
                </Link>
              ) : (
                <Link href="/account/sign-in" style={{
                  fontSize: 14, fontWeight: 600, color: "#211D15",
                  background: "#C0673E", borderRadius: 100,
                  padding: "8px 14px", textDecoration: "none",
                  fontFamily: "Fraunces, Georgia, serif"
                }}>
                  Sign in
                </Link>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: "1px solid #E3DBC6",
                  background: "#FCFAF3", display: "flex",
                  flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 4, cursor: "pointer"
                }}
                aria-label="Menu"
              >
                <span style={{ display: "block", width: 14, height: 1.5, background: "#211D15", borderRadius: 2 }} />
                <span style={{ display: "block", width: 14, height: 1.5, background: "#211D15", borderRadius: 2 }} />
                <span style={{ display: "block", width: 14, height: 1.5, background: "#211D15", borderRadius: 2 }} />
              </button>
            </>
          )}
        </div>
      </div>

      {menuOpen && !isAdmin && (
        <nav style={{ width: "100%", borderTop: "1px solid #E3DBC6", background: "#FCFAF3", padding: "8px 12px 14px" }}>
          {[
            { href: "/faq",     label: "FAQ"           },
            { href: "/contact", label: "Contact us"    },
          ].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} style={{
              display: "block", padding: "12px 14px", borderRadius: 10,
              fontSize: 14, fontWeight: 500,
              color: "#211D15",
              background: "transparent",
              textDecoration: "none", marginBottom: 2,
              fontFamily: "Fraunces, Georgia, serif", textTransform: "uppercase", letterSpacing: "0.02em"
            }}>
              {item.label}
            </Link>
          ))}
          <div style={{ borderTop: "1px solid #E3DBC6", marginTop: 8, paddingTop: 8 }}>
            <Link href="/admin/login" onClick={() => setMenuOpen(false)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 14px", borderRadius: 10, fontSize: 14,
              fontWeight: 500, color: "#938B78", textDecoration: "none"
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
