"use client";

import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSectionProps {
  faqs: FAQItem[];
}

export function FAQSection({ faqs }: FAQSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560, margin: "0 auto" }}>
        {faqs.map((faq, idx) => (
          <button
            key={idx}
            onClick={() => setExpanded(expanded === idx.toString() ? null : idx.toString())}
            style={{
              background: expanded === idx.toString()
                ? "linear-gradient(135deg, rgba(196,18,48,0.12) 0%, rgba(155,14,38,0.08) 100%)"
                : "white",
              border: expanded === idx.toString()
                ? "1.5px solid rgba(196,18,48,0.3)"
                : "1.5px solid #e2e8f0",
              borderRadius: 12,
              padding: "16px 18px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}>
              <h3 style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "#1c0505",
                flex: 1,
                lineHeight: 1.4,
                fontFamily: "var(--font-display)",
                textTransform: "capitalize",
              }}>
                {faq.question}
              </h3>
              <span style={{
                fontSize: 16,
                color: expanded === idx.toString() ? "#c41230" : "#94a3b8",
                flexShrink: 0,
                transition: "transform 0.2s ease, color 0.2s ease",
                transform: expanded === idx.toString() ? "rotate(180deg)" : "rotate(0deg)",
              }}>
                ▼
              </span>
            </div>
            {expanded === idx.toString() && (
              <p style={{
                margin: "12px 0 0",
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.65,
              }}>
                {faq.answer}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{
        marginTop: 40,
        paddingTop: 24,
        borderTop: "1px solid #e2e8f0",
        textAlign: "center",
        maxWidth: 560,
        margin: "40px auto 0",
      }}>
        <p style={{
          fontSize: 13,
          color: "#64748b",
          marginBottom: 12,
          lineHeight: 1.6,
        }}>
          Still have questions?
        </p>
        <a href="/contact" style={{
          display: "inline-block",
          padding: "12px 24px",
          borderRadius: 10,
          background: "linear-gradient(135deg, #c41230 0%, #9b0e26 100%)",
          color: "white",
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          boxShadow: "0 4px 12px rgba(196,18,48,0.35)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(196,18,48,0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(196,18,48,0.35)";
        }}>
          Contact Us
        </a>
      </div>
    </div>
  );
}
