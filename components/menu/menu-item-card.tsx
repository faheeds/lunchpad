"use client";

import { useState } from "react";
import Link from "next/link";

type MenuOption = {
  id: string;
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
};

type MenuItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  options: MenuOption[];
};

type Props = {
  item: MenuItem;
};

function stripCategoryPrefix(description: string | null): string | null {
  if (!description) return null;
  // Descriptions are stored as "Category Name. Actual description text."
  const match = description.match(/^[^.]+\.\s*([\s\S]*)/);
  return match ? match[1].trim() || null : description;
}

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function MenuItemCard({ item }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [addonsOpen, setAddonsOpen] = useState(false);
  // Use admin-uploaded URL from DB; fall back to nothing (shows placeholder)
  const imageUrl = item.imageUrl ?? null;
  const description = stripCategoryPrefix(item.description);
  const addons = item.options.filter((o) => o.optionType === "ADD_ON");

  return (
    <div style={{
      background: "white",
      borderRadius: 18,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(33,29,21,0.08)",
      display: "flex",
      flexDirection: "column",
      border: "1px solid #E3DBC6",
    }}>
      {/* Photo or editorial placeholder */}
      <div style={{ position: "relative", height: 160, overflow: "hidden", flexShrink: 0 }}>
        {imageUrl && !imgFailed ? (
          <img
            src={imageUrl}
            alt={item.name}
            width={300}
            height={160}
            onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: "#EFE8D7",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 48, color: "#C0B8A0",
          }}>
            {/* subtle placeholder — no emoji */}
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        )}
        {/* Price badge */}
        <div style={{
          position: "absolute", bottom: 10, right: 10,
          background: "#211D15",
          borderRadius: 10, padding: "4px 10px",
          fontSize: 13, fontWeight: 700, color: "#F6F1E6",
          letterSpacing: "0.01em",
          fontFamily: "Fraunces, Georgia, serif",
        }}>
          {fmt(item.basePriceCents)}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "14px 16px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#211D15", lineHeight: 1.2, margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
          {item.name}
        </p>

        {description && (
          <p style={{ fontSize: 14, color: "#938B78", lineHeight: 1.55, margin: 0 }}>
            {description}
          </p>
        )}

        {/* Add-ons — collapsible */}
        {addons.length > 0 && (
          <div style={{ borderTop: "1px solid #E3DBC6", paddingTop: 8 }}>
            <button
              onClick={() => setAddonsOpen((o) => !o)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", background: "none", border: "none",
                padding: 0, cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: "#C0673E", fontFamily: "Fraunces, Georgia, serif" }}>
                + {addons.length} add-on{addons.length > 1 ? "s" : ""} available
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#938B78" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: addonsOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
              >
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            {addonsOpen && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {addons.map((o) => (
                  <span key={o.id} style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 20,
                    background: "#DEE2CF", color: "#2C4031",
                    border: "1px solid #DEE2CF", fontWeight: 500,
                  }}>
                    + {o.name}{o.priceDeltaCents ? ` (${fmt(o.priceDeltaCents)})` : " (free)"}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Order CTA */}
      <div style={{ padding: "0 16px 16px" }}>
        <Link href={`/order?item=${item.slug}`} style={{
          display: "block", textAlign: "center",
          background: "#C0673E", color: "#F6F1E6",
          borderRadius: 10, padding: "10px 16px",
          fontSize: 13, fontWeight: 600, textDecoration: "none",
          letterSpacing: "0.01em",
          fontFamily: "Fraunces, Georgia, serif",
        }}>
          Order this item →
        </Link>
      </div>
    </div>
  );
}
