import Link from "next/link";
import Image from "next/image";
import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { getLabelsForOperator } from "@/lib/location-labels";
import { PlatformLanding } from "@/components/platform-landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const restaurant = await getCurrentRestaurant();

  // ── Restaurant mode (subdomain) ──────────────────────────────────────────
  if (restaurant) {
    const restaurantName = restaurant.name;
    const labels = getLabelsForOperator(restaurant.operatorType);

    const itemsWithPhotos = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isActive: true, imageUrl: { not: null } },
      select: { name: true, imageUrl: true },
      orderBy: { name: "asc" },
    });

    const pick = (keywords: string[]) =>
      itemsWithPhotos.find((i) => keywords.some((k) => i.name.toLowerCase().includes(k)));

    const pinned = [
      pick(["burger", "smash", "double"]),
      pick(["salad"]),
      pick(["chicken", "crispy", "sandwich"]),
      pick(["mac", "macaroni", "cheese"]),
    ].filter(Boolean) as typeof itemsWithPhotos;

    const pinnedNames = new Set(pinned.map((i) => i.name));
    const rest = itemsWithPhotos.filter((i) => !pinnedNames.has(i.name));
    const menuGridItems = [...pinned, ...rest].map((i) => ({ src: i.imageUrl!, alt: i.name }));

    // Hero image: restaurant upload → first menu photo → gradient fallback
    const heroSrc = restaurant.heroImageUrl ?? (itemsWithPhotos[0]?.imageUrl ?? null);

    return (
      <>
        <SiteHeaderServer />
        <main className="app-content" id="main-content">

          {/* Full-bleed hero */}
          <section style={{ position: "relative", width: "100%", height: "90svh", minHeight: 480, overflow: "hidden" }}>
            {heroSrc ? (
              <Image
                src={heroSrc}
                alt={restaurantName}
                fill
                priority
                style={{ objectFit: "cover", objectPosition: "center top" }}
              />
            ) : (
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${restaurant.darkColor ?? "#1E2C22"}, ${restaurant.primaryColor ?? "#2C4031"})` }} />
            )}
            {/* Dark gradient overlay */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.72) 100%)" }} />
            {/* Hero content — anchored to bottom */}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", textAlign: "center", padding: "0 24px 64px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.30em", textTransform: "uppercase", color: "rgba(255,255,255,0.60)", marginBottom: 12, fontFamily: "var(--font-display)" }}>
                {restaurantName}
              </p>
              <h1 style={{ fontSize: "clamp(2.4rem, 9vw, 5rem)", fontWeight: 700, lineHeight: 1.0, color: "white", marginBottom: 18, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.01em", maxWidth: 720 }}>
                {restaurantName}
              </h1>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.72)", marginBottom: 32, lineHeight: 1.5, maxWidth: 480 }}>
                Fresh food delivered to your {labels.type.toLowerCase()} &mdash; order for tomorrow or plan the whole week.
              </p>
              <Link href="/order" style={{ padding: "14px 34px", borderRadius: 100, fontSize: 15, fontWeight: 700, textDecoration: "none", background: "#C0673E", color: "white", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.08em", boxShadow: "0 4px 24px rgba(192,103,62,0.50)" }}>
                Order Now
              </Link>
            </div>
          </section>

          {/* This Week's Menu */}
          {menuGridItems.length > 0 && (
            <div style={{ padding: "28px 20px 8px" }}>
              <p style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--brand-on-white)", marginBottom: 14, fontFamily: "var(--font-display)" }}>
                This Week&rsquo;s Menu
              </p>
              {/* Tablet + desktop: 2-col / 4-col grid */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {menuGridItems.slice(0, 8).map((item, i) => (
                  <Link key={i} href="/menu" style={{ display: "block", textDecoration: "none", borderRadius: 14, overflow: "hidden", position: "relative", aspectRatio: "1 / 1", boxShadow: "0 3px 10px rgba(var(--dark-rgb),0.15)" }}>
                    <img src={item.src} alt={item.alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "22px 10px 8px", background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)" }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "white", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.alt}</p>
                    </div>
                  </Link>
                ))}
              </div>
              {/* Mobile: horizontal scroll */}
              <div className="sm:hidden" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollSnapType: "x mandatory" }}>
                {menuGridItems.slice(0, 8).map((item, i) => (
                  <Link key={i} href="/menu" style={{ flexShrink: 0, width: 150, height: 150, borderRadius: 14, overflow: "hidden", position: "relative", scrollSnapAlign: "start", boxShadow: "0 3px 10px rgba(var(--dark-rgb),0.18)", display: "block", textDecoration: "none" }}>
                    <img src={item.src} alt={item.alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 8px 7px", background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)" }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "white", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.alt}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Weekly plan promo */}
          <div style={{ padding: "20px 20px 28px" }}>
            <div style={{ background: restaurant.primaryColor ?? "#2C4031", borderRadius: 18, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-display)" }}>
                Save time
              </p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "white", fontFamily: "var(--font-display)", textTransform: "uppercase", lineHeight: 1.1 }}>
                Plan<br />The Week
              </p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.70)", lineHeight: 1.5, maxWidth: 340 }}>
                Order multiple days at once &mdash; one checkout, all week sorted.
              </p>
              <Link href="/weekly" style={{ padding: "12px 22px", borderRadius: 100, fontSize: 13, fontWeight: 700, textDecoration: "none", background: "white", color: restaurant.primaryColor ?? "#2C4031", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "flex-start", marginTop: 6, display: "inline-block" }}>
                Plan The Week
              </Link>
            </div>
          </div>

          <SiteFooter />
        </main>
        <AppNav />
      </>
    );
  }

  // ── Platform mode (root domain) ──────────────────────────────────────────
  return <PlatformLanding />;
}
