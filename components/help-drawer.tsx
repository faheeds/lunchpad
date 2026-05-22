"use client";

import { useEffect, useRef, useState } from "react";
import { FAQAccordion } from "./faq-accordion";

export function HelpDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useRef<HTMLDivElement>(null);

  // Focus management: trap focus within drawer when open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      // Tab trap within drawer
      if (e.key === "Tab" && focusTrapRef.current) {
        const focusableElements = focusTrapRef.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (e.shiftKey) {
          if (activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus first element when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = requestAnimationFrame(() => {
      const firstButton = focusTrapRef.current?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      firstButton?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        aria-label="Open help"
        className="flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          color: "rgba(255, 255, 255, 0.6)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 500,
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)";
        }}
      >
        ?
      </button>

      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.4)",
            zIndex: 999,
          }}
          onClick={() => {
            setIsOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}

      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Help and frequently asked questions"
        aria-modal="true"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          width: "100%",
          maxWidth: 420,
          height: "100vh",
          background: "#F6F1E6",
          boxShadow: isOpen ? "-4px 0 20px rgba(0, 0, 0, 0.25)" : "none",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease-out",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #E3DBC6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "#211D15",
              fontFamily: "Fraunces, Georgia, serif",
            }}
          >
            Help
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close help drawer"
            style={{
              background: "none",
              border: "none",
              color: "#938B78",
              cursor: "pointer",
              fontSize: 24,
              padding: 0,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#5B5446";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#938B78";
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          ref={focusTrapRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
          }}
        >
          <FAQAccordion />
        </div>

        {/* Contact CTA */}
        <div
          style={{
            padding: "16px 24px 28px",
            borderTop: "1px solid #E3DBC6",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "#5B5446",
              margin: 0,
              marginBottom: 12,
            }}
          >
            Still have questions?
          </p>
          <a
            href="/contact"
            style={{
              display: "block",
              textAlign: "center",
              padding: "12px 16px",
              borderRadius: 999,
              background: "#2C4031",
              color: "#F6F1E6",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1E2C22";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#2C4031";
            }}
          >
            Contact us
          </a>
        </div>
      </div>
    </>
  );
}
