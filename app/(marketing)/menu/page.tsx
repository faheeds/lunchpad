import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";
import { MenuItemCard } from "@/components/menu/menu-item-card";

export const dynamic = "force-dynamic";

// ── Category helpers (mirrors admin/menu logic) ─────────────────────────────

const CATEGORIES = [
  "Signature Burgers & Sandwiches",
  "Salads with Protein",
  "Comfort Favorites",
  "Sides & Snacks",
] as const;

const CAT_META: Record<string, { icon: string; gradient: string; label: string }> = {
  "Signature Burgers & Sandwiches": {
    icon: "🍔",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
    label: "Burgers & Sandwiches",
  },
  "Salads with Protein": {
    icon: "🥗",
    gradient: "linear-gradient(135deg, #86efac 0%, #22c55e 100%)",
    label: "Salads",
  },
  "Comfort Favorites": {
    icon: "🍗",
    gradient: "linear-gradient(135deg, #fca5a5 0%, #ef4444 100%)",
    label: "Comfort Favorites",
  },
  "Sides & Snacks": {
    icon: "🍟",
    gradient: "linear-gradient(135deg, #fed7aa 0%, #f97316 100%)",
    label: "Sides & Snacks",
  },
};

function getCategory(name: string, description: string | null) {
  const prefix = description?.split(".")[0]?.trim();
  if (prefix && CATEGORIES.includes(prefix as typeof CATEGORIES[number])) return prefix;
  if (name.includes("Burger") || name.includes("Sandwich")) return "Signature Burgers & Sandwiches";
  if (name.includes("Salad")) return "Salads with Protein";
  if (name.includes("Mac") || name.includes("Quesadilla") || name.includes("Wings") || name.includes("Tender")) return "Comfort Favorites";
  return "Sides & Snacks";
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function MenuPage() {
  const items = await prisma.menuItem.findMany({
    where: { isActive: true },
    include: {
      options: { orderBy: [{ optionType: "asc" }, { sortOrder: "asc" }] },
    },
    orderBy: { name: "asc" },
  });

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, typeof items>>((acc, cat) => {
    acc[cat] = items.filter((i) => getCategory(i.name, i.description) === cat);
    return acc;
  }, {});

  const totalItems = items.length;

  return (
    <>
      <SiteHeader />

      <main className="app-content">
        {/* ── Hero strip ─────────────────────────────────────────────────── */}
        <div style={{
          background: "linear-gradient(135deg, #1c0505 0%, #3b0a0a 100%)",
          padding: "28px 20px 24px",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* decorative ring */}
          <div style={{
            position: "absolute", top: -40, right: -40,
            width: 160, height: 160, borderRadius: "50%",
            background: "rgba(245,158,11,0.07)", pointerEvents: "none",
          }} />
          <p style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "#f59e0b", marginBottom: 6,
          }}>
            ★ Local Bigger Burger ★
          </p>
          <h1 style={{
            fontSize: 28, fontWeight: 800, color: "white",
            textTransform: "uppercase", letterSpacing: "0.02em",
            lineHeight: 1.1, marginBottom: 8,
          }}>
            Our Menu
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 18, lineHeight: 1.55 }}>
            HFSAA certified · Hand slaughtered halal · {totalItems} fresh items
          </p>
          <Link href="/order" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#c41230", color: "white",
            borderRadius: 12, padding: "11px 20px",
            fontSize: 13, fontWeight: 700, textDecoration: "none",
            letterSpacing: "0.02em",
          }}>
            Order Lunch
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>

        {/* ── Category quick-jump pills ───────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 8, padding: "14px 16px",
          overflowX: "auto", background: "#fafafa",
          borderBottom: "1px solid #f1f5f9",
        }}>
          {CATEGORIES.map((cat) => {
            const meta = CAT_META[cat];
            const count = grouped[cat]?.length ?? 0;
            if (!count) return null;
            return (
              <a key={cat} href={`#cat-${cat.replace(/[^a-z]/gi, "-").toLowerCase()}`} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 13px", borderRadius: 20, flexShrink: 0,
                background: "white", border: "1.5px solid #e2e8f0",
                fontSize: 12, fontWeight: 600, color: "#374151",
                textDecoration: "none",
              }}>
                <span style={{ fontSize: 14 }}>{meta.icon}</span>
                {meta.label}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 5px",
                  borderRadius: 10, background: "#f1f5f9", color: "#64748b",
                }}>
                  {count}
                </span>
              </a>
            );
          })}
        </div>

        {/* ── Item grid by category ───────────────────────────────────────── */}
        <div style={{ padding: "4px 0 100px", background: "#f8fafc" }}>
          {CATEGORIES.map((cat) => {
            const catItems = grouped[cat];
            if (!catItems?.length) return null;
            const meta = CAT_META[cat];
            return (
              <section
                key={cat}
                id={`cat-${cat.replace(/[^a-z]/gi, "-").toLowerCase()}`}
                style={{ padding: "20px 16px 8px" }}
              >
                {/* Category header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: meta.gradient,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {meta.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#1c0505", margin: 0 }}>
                      {cat}
                    </p>
                    <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
                      {catItems.length} {catItems.length === 1 ? "item" : "items"}
                    </p>
                  </div>
                </div>

                {/* 2-column grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 12,
                }}>
                  {catItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={{
                        id: item.id,
                        slug: item.slug,
                        name: item.name,
                        description: item.description,
                        imageUrl: item.imageUrl ?? null,
                        basePriceCents: item.basePriceCents,
                        options: item.options.map((o) => ({
                          id: o.id,
                          name: o.name,
                          optionType: o.optionType as "ADD_ON" | "REMOVAL",
                          priceDeltaCents: o.priceDeltaCents,
                        })),
                      }}
                      categoryIcon={meta.icon}
                      categoryGradient={meta.gradient}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Empty state */}
          {totalItems === 0 && (
            <div style={{
              margin: "40px 20px", padding: 32, borderRadius: 18,
              background: "white", textAlign: "center",
              border: "1px solid #e2e8f0",
            }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>🍽️</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#1c0505", marginBottom: 6 }}>
                Menu coming soon
              </p>
              <p style={{ fontSize: 13, color: "#64748b" }}>
                Check back shortly — items will appear here once the menu is configured.
              </p>
            </div>
          )}

          {/* Bottom CTA */}
          {totalItems > 0 && (
            <div style={{ padding: "16px 16px 8px" }}>
              <Link href="/order" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "linear-gradient(135deg, #c41230 0%, #9b0e26 100%)",
                color: "white", borderRadius: 16, padding: "16px 24px",
                fontSize: 15, fontWeight: 700, textDecoration: "none",
                letterSpacing: "0.02em", boxShadow: "0 4px 12px rgba(196,18,48,0.35)",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                Place an Order
              </Link>
            </div>
          )}
        </div>
      </main>

      <AppNav />
    </>
  );
}
