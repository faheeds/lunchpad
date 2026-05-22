"use client";

import { useState } from "react";

type FAQItem = {
  id: string;
  question: string;
  answer: string;
};

const faqItems: FAQItem[] = [
  {
    id: "how-to-order",
    question: "How do I place an order?",
    answer:
      "Visit the Menu page to browse available items, then go to the Order page to select what you'd like. Choose your delivery date, add any customizations (extras or removals), and proceed to checkout. You'll receive a confirmation email with your order number.",
  },
  {
    id: "payment",
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards, including Visa, Mastercard, American Express, and Discover. Payments are processed securely through our payment system.",
  },
  {
    id: "edit-order",
    question: "Can I change my order after placing it?",
    answer:
      "Orders can be modified or cancelled from your Order History up until the morning of delivery (typically before 8 AM). After that, please contact us directly if you need to make changes.",
  },
  {
    id: "allergen-info",
    question: "How are allergies handled?",
    answer:
      "When placing an order, you can specify dietary restrictions and allergies during checkout. The kitchen prepares items with care, but note that our facility may handle common allergens. Always inform us of critical allergies.",
  },
  {
    id: "refunds",
    question: "What's your refund policy?",
    answer:
      "If you cancel an order before the cutoff time, you'll receive a full refund. Cancelled orders after the cutoff may not be refundable depending on when you cancel. Check your Order History for specific cancellation details.",
  },
  {
    id: "dietary-options",
    question: "Do you offer vegetarian or vegan options?",
    answer:
      "Many operators offer a variety of dietary options. Check the Menu page to see what's available. You can also filter by your dietary preferences when placing an order.",
  },
  {
    id: "delivery",
    question: "How is my order delivered?",
    answer:
      "Orders are delivered on scheduled delivery days to the configured location. Delivery times and locations are set by the operator and displayed during checkout.",
  },
  {
    id: "account",
    question: "How do I manage my account?",
    answer:
      "Visit your account page to update your contact information, manage your saved orders, view order history, and manage your account settings.",
  },
];

export function FAQAccordion() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {faqItems.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div key={item.id}>
            <button
              onClick={() => toggleItem(item.id)}
              aria-expanded={isExpanded}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1px solid #E3DBC6",
                background: isExpanded ? "#EFE8D7" : "white",
                color: "#211D15",
                textAlign: "left",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#2C4031";
                e.currentTarget.style.background = isExpanded ? "#EFE8D7" : "#FCFAF3";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#E3DBC6";
                e.currentTarget.style.background = isExpanded ? "#EFE8D7" : "white";
              }}
            >
              <span>{item.question}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#938B78",
                  marginLeft: 12,
                  flexShrink: 0,
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.2s",
                }}
              >
                ▼
              </span>
            </button>

            {isExpanded && (
              <div
                style={{
                  padding: "12px 16px",
                  marginTop: 4,
                  borderRadius: 12,
                  background: "#EFE8D7",
                  border: "1px solid #E3DBC6",
                  borderTop: "none",
                  animation: "slideDown 0.2s ease-out",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "#5B5446",
                  }}
                >
                  {item.answer}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
