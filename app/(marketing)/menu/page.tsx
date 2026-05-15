import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { MenuItemCard } from "@/components/menu/menu-item-card";
import { getCurrentRestaurant } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

// ── Category helpers ─────────────────────────────────────────────────────────
// Categories are read from `MenuItem.category` per item. Each restaurant
// owns its own taxonomy via the admin Menu page (task #28 — custom
// categories). We render whatever categories exist, in alphabetical
// order, with an "Other" bucket for uncategorized items.
//
// Decorative icons + gradients are matched on common keywords so a brand
// new operator's menu looks alive without them needing to configure
// anything. Unknown categories fall back to a neutral icon.

type CategoryMeta = { icon: string; gradient: string };

const FALLBACK_META: CategoryMeta = {
  icon: "🍽️",
  gradient: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
};

// Keyword → meta heuristic. Picks a sensible visual style for typical
// restaurant categories without forcing operators to configure them.
function getCategoryMeta(category: string): CategoryMeta {
  const c = category.toLowerCase();
  if (c.match(/burger|sandwich|wrap|sub/)) {
    return { icon: "🍔", gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)" };
  }
  if (c.match(/salad|veg|green|bowl/)) {
    return { icon: "🥗", gradient: "linear-gradient(135deg, #86efac 0%, #22c55e 100%)" };
  }
  if (c.match(/pizza|pasta|italian/)) {
    return { icon: "🍕", gradient: "linear-gradient(135deg, #fca5a5 0%, #ef4444 100%)" };
  }
  if (c.match(/chicken|wings|tender|nugget/)) {
    return { icon: "🍗", gradient: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)" };
  }
  if (c.match(/taco|burrito|mexican|quesadilla/)) {
    return { icon: "🌮", gradient: "linear-gradient(135deg, #fcd34d 0%, #ea580c 100%)" };
  }
  if (c.match(/asian|noodle|rice|sushi/)) {
    return { icon: "🍜", gradient: "linear-gradient(135deg, #fda4af 0%, #e11d48 100%)" };
  }
  if (c.match(/breakfast|pancake|waffle|egg/)) {
    return { icon: "🥞", gradient: "linear-gradient(135deg, #fde68a 0%, #fbbf24 100%)" };
  }
  if (c.match(/drink|beverage|juice|smoothie|milk|tea|coffee/)) {
    return { icon: "🥤", gradient: "linear-gradient(135deg, #93c5fd 0%, #3b82f6 100%)" };
  }
  if (c.match(/dessert|cookie|cake|ice cream|sweet/)) {
    return { icon: "🍰", gradient: "linear-gradient(135deg, #f9a8d4 0%, #ec4899 100%)" };
  }
  if (c.match(/side|snack|fries|chips/)) {
    return { icon: "🍟", gradient: "linear-gradient(135deg, #fed7aa 0%, #f97316 100%)" };
  }
  if (c.match(/comfort|favorite/)) {
    return { icon: "🍗", gradient: "linear-gradient(135deg, #fca5a5 0%, #ef4444 100%)" };
  }
  return FALLBACK_META;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function MenuPage() {
  const restaurant = await getCurrentRestaurant();
  // Fallback to the platform name when /menu is hit on the apex (no tenant
  // context). Was hardcoded to "Hot Lunch" (the original tenant's brand).
  const restaurantName = restaurant?.name ?? "LunchPad";

  // Multi-tenant: only show menu items for the current restaurant.
  // If no restaurant context (e.g. apex /menu), show none.
  const items = restaurant
    ? await prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
        include: {
          options: { orderBy: [{ optionType: "asc" }, { sortOrder: "asc" }] },
        },
        orderBy: { name: "asc" },
      })
    : [];

  // Group by MenuItem.category, with an "Other" bucket for uncategorized
  // items. The order of categories is whatever sortOrder the operator
  // configured (set on MenuItem.sortOrder, items already ordered by name);
  // we extract distinct categories in first-seen order so the rendering
  // matches the admin's intended structure.
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.category?.trim() || "Other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  const categories = Array.from(grouped.keys());

  const totalItems = items.length;

  return (
    <>
      <SiteHeaderServer />

      <main id="main-content" className="app-content">
        {/* ── Hero strip ─────────────────────────────────────────────────── */}
        <div style={{
          background: "linear-gradient(135deg, var(--dark-bg) 0%, color-mix(in srgb, var(--dark-bg) 80%, #000) 100%)",
          padding: "28px 20px 28px",
          position: "relative",
          overflow: "hidden",
          // Clean break from content below — soft shadow instead of bleed.
          boxShadow: "0 4px 16px -8px rgba(0,0,0,0.25)",
        }}>
          {/* decorative ring */}
          <div style={{
            position: "absolute", top: -40, right: -40,
            width: 160, height: 160, borderRadius: "50%",
            background: "rgba(245,158,11,0.07)", pointerEvents: "none",
          }} />
          <p style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "var(--accent-on-dark)", marginBottom: 6,
          }}>
            ★ {restaurantName} ★
          </p>
          <h1 style={{
            fontSize: 28, fontWeight: 800, color: "var(--hero-title)",
            textTransform: "uppercase", letterSpacing: "0.02em",
            lineHeight: 1.1, marginBottom: 8,
          }}>
            Our Menu
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 18, lineHeight: 1.55 }}>
            {totalItems} fresh items — made to order
          </p>
          <Link href="/order" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--brand-on-dark)", color: "var(--hero-title)",
            borderRadius: 12, padding: "11px 20px",
            fontSize: 13, fontWeight: 700, textDecoration: "none",
            letterSpacing: "0.02em",
          }}>
            Order Lunch
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>

        {/* ── Category quick-jump pills ───────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 8, padding: "16px 16px 14px",
          overflowX: "auto", background: "#fafafa",
          borderTop: "1px solid rgba(0,0,0,0.04)",
          borderBottom: "1px solid #f1f5f9",
        }}>
          {categories.map((cat) => {
            const meta = getCategoryMeta(cat);
            const count = grouped.get(cat)?.length ?? 0;
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
                {cat}
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
          {categories.map((cat) => {
            const catItems = grouped.get(cat);
            if (!catItems?.length) return null;
            const meta = getCategoryMeta(cat);
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
                background: "linear-gradient(135deg, var(--brand-hex) 0%, color-mix(in srgb, var(--brand-hex) 80%, #000) 100%)",
                color: "var(--hero-title)", borderRadius: 16, padding: "16px 24px",
                fontSize: 15, fontWeight: 700, textDecoration: "none",
                letterSpacing: "0.02em", boxShadow: "0 4px 12px rgba(var(--brand-rgb),0.35)",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
