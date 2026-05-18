"use client";

import { useEffect, useState } from "react";

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("lunchpad-cookie-consent");
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem("lunchpad-cookie-consent", "all");
    setShowBanner(false);
  };

  const handleNecessaryOnly = () => {
    localStorage.setItem("lunchpad-cookie-consent", "necessary");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 999,
      background: "var(--dark-bg)",
      borderTop: "1px solid rgba(255,255,255,0.1)",
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {/* Content */}
      <div style={{ maxWidth: 600 }}>
        <p style={{
          margin: 0,
          fontSize: 13,
          color: "rgba(255,255,255,0.85)",
          lineHeight: 1.5,
        }}>
          We use cookies to remember your preferences and analyze how you use our service. You can control this with the options below.
        </p>
      </div>

      {/* Buttons */}
      <div style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
      }}>
        <button
          onClick={handleNecessaryOnly}
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "rgba(255,255,255,0.8)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          Necessary only
        </button>
        <button
          onClick={handleAcceptAll}
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            border: "none",
            background: "var(--brand-on-dark)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
