"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FAQItem {
  question: string;
  answer: string;
}

const COMMON_FAQS: FAQItem[] = [
  {
    question: "How do I place an order?",
    answer: "Go to the Menu page to see available items and delivery dates. Select items, choose any additions or removals, then proceed to checkout. You'll receive a confirmation email immediately."
  },
  {
    question: "Can I cancel an order?",
    answer: "Yes! You can cancel orders before the cutoff time in your Order History. After the cutoff, contact us for assistance."
  },
  {
    question: "What is the ordering cutoff time?",
    answer: "Cutoff times vary by school and delivery date. Check the delivery date calendar for specific times. We send reminders 24 hours before cutoff."
  },
  {
    question: "How will I receive my order?",
    answer: "Orders are delivered on the scheduled delivery date to your school. Your child will receive the meal during lunch or as scheduled."
  },
];

export function HelpDrawer({ isOpen, onClose }: HelpDrawerProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const drawerRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      drawerRef.current?.focus();
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, onClose]);

  const displayedFAQs = COMMON_FAQS.filter((faq) =>
    searchQuery === "" ||
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 999,
            animation: "fadeIn 0.2s ease-out",
          }}
        />
      )}
      <div
        ref={drawerRef}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(100%, 400px)",
          background: "white",
          boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
          zIndex: 1000,
          overflow: "auto",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          background: "var(--dark-bg)",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <h2 style={{
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Help
          </h2>
          <button
            onClick={onClose}
            aria-label="Close help drawer"
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              fontSize: 20,
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 16px" }}>
          {/* Search Box (stub) */}
          <div style={{ marginBottom: 20 }}>
            <input
              type="text"
              placeholder="Search help…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search help"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1.5px solid #e2e8f0",
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Quick Links */}
          <div style={{ marginBottom: 24 }}>
            <p style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
              margin: "0 0 8px",
            }}>
              Quick Links
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link
                href="/faq"
                onClick={onClose}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(196,18,48,0.08)",
                  color: "#c41230",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: "var(--font-display)",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                → FAQ
              </Link>
              <Link
                href="/contact"
                onClick={onClose}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(196,18,48,0.08)",
                  color: "#c41230",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: "var(--font-display)",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                → Contact us
              </Link>
            </div>
          </div>

          {/* Common Questions */}
          <div>
            <p style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
              margin: "0 0 8px",
            }}>
              Common Questions
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {displayedFAQs.length > 0 ? (
                displayedFAQs.map((faq, idx) => (
                  <button
                    key={idx}
                    onClick={() => setExpanded(expanded === idx.toString() ? null : idx.toString())}
                    style={{
                      background: "transparent",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: "12px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 8,
                    }}>
                      <p style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#1c0505",
                        flex: 1,
                      }}>
                        {faq.question}
                      </p>
                      <span style={{
                        fontSize: 12,
                        color: "#94a3b8",
                        flexShrink: 0,
                        transition: "transform 0.2s ease",
                        transform: expanded === idx.toString() ? "rotate(180deg)" : "rotate(0deg)",
                      }}>
                        ▼
                      </span>
                    </div>
                    {expanded === idx.toString() && (
                      <p style={{
                        margin: "8px 0 0",
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.55,
                      }}>
                        {faq.answer}
                      </p>
                    )}
                  </button>
                ))
              ) : (
                <p style={{
                  fontSize: 12,
                  color: "#94a3b8",
                  textAlign: "center",
                  padding: "20px 0",
                }}>
                  No matching questions found.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
