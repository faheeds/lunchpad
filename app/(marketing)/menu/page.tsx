import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";
import { MenuItemCard } from "@/components/menu/menu-item-card";
import { getCurrentRestaurant } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

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

      <main className="app-content">
        {/* ── Hero strip ─────────────────────────────────────────────────── */}
        <div style={{
          background: "#F6F1E6",
          padding: "28px 20px 28px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(33,29,21,0.08)",
        }}>
          <p style={{
            fontSize: 14, fontWeight: 700, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "#938B78", marginBottom: 6,
          }}>
            ★ {restaurantName} ★
          </p>
          <h1 style={{
            fontSize: 28, fontWeight: 800, color: "#211D15",
            textTransform: "uppercase", letterSpacing: "0.02em",
            lineHeight: 1.1, marginBottom: 8, fontFamily: "Fraunces, Georgia, serif",
          }}>
            Our Menu
          </h1>
          <p style={{ fontSize: 14, color: "rgba(33,29,21,0.55)", marginBottom: 18, lineHeight: 1.55 }}>
            {totalItems} fresh items — made to order
          </p>
          <Link href="/order" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#2C4031", color: "#F6F1E6",
            borderRadius: 12, padding: "11px 20px",
            fontSize: 14, fontWeight: 700, textDecoration: "none",
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
          overflowX: "auto", background: "#FCFAF3",
          borderTop: "1px solid #E3DBC6",
          borderBottom: "1px solid #E3DBC6",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          {categories.map((cat) => {
            const count = grouped.get(cat)?.length ?? 0;
            if (!count) return null;
            return (
              <a key={cat} href={`#cat-${cat.replace(/[^a-z]/gi, "-").toLowerCase()}`} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 13px", borderRadius: 20, flexShrink: 0,
                background: "white", border: "1.5px solid #E3DBC6",
                fontSize: 14, fontWeight: 600, color: "#211D15",
                textDecoration: "none",
                fontFamily: "Fraunces, Georgia, serif",
              }}>
                {cat}
                <span style={{
                  fontSize: 14, fontWeight: 700, padding: "1px 5px",
                  borderRadius: 10, background: "#DEE2CF", color: "#2C4031",
                }}>
                  {count}
                </span>
              </a>
            );
          })}
        </div>

        {/* ── Item grid by category ───────────────────────────────────────── */}
        <div style={{ padding: "4px 0 100px", background: "#F6F1E6" }}>
          {categories.map((cat) => {
            const catItems = grouped.get(cat);
            if (!catItems?.length) return null;
            return (
              <section
                key={cat}
                id={`cat-${cat.replace(/[^a-z]/gi, "-").toLowerCase()}`}
                style={{ padding: "20px 16px 8px" }}
              >
                {/* Category header */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: "#211D15", margin: 0, marginBottom: 4, fontFamily: "Fraunces, Georgia, serif" }}>
                    {cat}
                  </p>
                  <p style={{ fontSize: 14, color: "#938B78", margin: 0 }}>
                    {catItems.length} {catItems.length === 1 ? "item" : "items"}
                  </p>
                </div>

                {/* Responsive grid: 2 columns below 1280px, 3 at 1280px+ */}
                <div className="menu-grid" style={{
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
              border: "1px solid #E3DBC6",
              boxShadow: "0 1px 3px rgba(33,29,21,0.08)",
            }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#211D15", marginBottom: 6, fontFamily: "Fraunces, Georgia, serif" }}>
                Menu coming soon
              </p>
              <p style={{ fontSize: 14, color: "#938B78" }}>
                Check back shortly — items will appear here once the menu is configured.
              </p>
            </div>
          )}

          {/* Bottom CTA */}
          {totalItems > 0 && (
            <div style={{ padding: "16px 16px 8px" }}>
              <Link href="/order" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "#C0673E",
                color: "#F6F1E6", borderRadius: 16, padding: "16px 24px",
                fontSize: 16, fontWeight: 700, textDecoration: "none",
                letterSpacing: "0.02em", boxShadow: "0 2px 8px rgba(192,103,62,0.25)",
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

        <SiteFooter />
      </main>

      <AppNav />
    </>
  );
}
