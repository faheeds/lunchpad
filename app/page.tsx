import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { SiteHeaderServer } from "@/components/site-header-server";
import { SiteFooter } from "@/components/site-footer";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { getLabelsForOperator } from "@/lib/location-labels";
import { PlatformLanding } from "@/components/platform-landing";
import { HeroCarousel } from "@/components/hero-carousel";

export const dynamic = "force-dynamic";

// ─── Page ─────────────────────────────────────────────────────────────────────

function buildMenuSummary(categories: string[]): string {
  if (categories.length === 0) {
    return "Choose from the full menu — fully customizable";
  }

  // Take up to 3 distinct categories and join with commas + "& more"
  const displayed = categories.slice(0, 3);
  if (displayed.length === 1) {
    return `${displayed[0]} & more`;
  }
  return `${displayed.slice(0, -1).join(", ")} & ${displayed[displayed.length - 1]}`;
}

function buildCutoffCopy(nextDeliveryDate: any): string {
  if (!nextDeliveryDate) {
    return "Each delivery date shows its own ordering deadline";
  }

  const cutoffDayName = formatInTimeZone(
    new Date(nextDeliveryDate.cutoffAt),
    nextDeliveryDate.school.timezone,
    "EEEE"
  );
  const cutoffTime = formatInTimeZone(
    nextDeliveryDate.cutoffAt,
    nextDeliveryDate.school.timezone,
    "h:mm a"
  );

  // Calculate the day of delivery (assuming cutoff is the day before)
  const cutoffDate = new Date(nextDeliveryDate.cutoffAt);
  const deliveryDate = new Date(nextDeliveryDate.deliveryDate);
  const daysBefore = Math.round((deliveryDate.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysBefore === 1) {
    return `Ordering closes ${cutoffDayName} ${cutoffTime} for next-day delivery`;
  } else {
    return `Each delivery date shows its own ordering deadline`;
  }
}

export default async function HomePage() {
  const restaurant = await getCurrentRestaurant();

  // ── Restaurant mode (subdomain) ──────────────────────────────────────────
  if (restaurant) {
    const restaurantName = restaurant.name;
    const schoolCount = await prisma.school.count({ where: { restaurantId: restaurant.id, isActive: true } });
    // Restaurant-wide label set — drives "school" vs "office" vs
    // neutral (hybrid) copy across the tenant landing page.
    const labels = getLabelsForOperator(restaurant.operatorType);

    // Fetch distinct menu categories for summary copy
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    const categories = menuItems
      .map((m) => m.category?.trim())
      .filter(Boolean) as string[];
    const menuSummary = buildMenuSummary(categories);

    // Fetch the next open delivery date for cutoff copy
    const nextDeliveryDate = await prisma.deliveryDate.findFirst({
      where: {
        orderingOpen: true,
        cancelledAt: null,
        cutoffAt: { gt: new Date() },
        school: { isActive: true, restaurantId: restaurant.id }
      },
      include: { school: { select: { timezone: true } } },
      orderBy: { deliveryDate: "asc" }
    });
    const cutoffCopy = buildCutoffCopy(nextDeliveryDate);

    const features = [
      { text: schoolCount === 1 ? `1 ${labels.type.toLowerCase()}` : `${schoolCount} ${labels.typePlural.toLowerCase()}`, sub: `Fresh lunch delivered on-site`, icon: "location", href: null },
      { text: "Full menu",      sub: menuSummary,  icon: "menu",     href: "/menu"    },
      { text: labels.unit === "Student" ? "Add Your Kids" : `Save ${labels.unitPlural}`,  sub: "Faster checkout every time",       icon: "child",    href: "/account" },
      { text: "Weekly planner", sub: "One checkout for the week",        icon: "calendar", href: "/weekly"  },
    ];

    const orderSteps = [
      { n: "1", title: "Pick location & date", body: `Select a location and an available delivery date. ${cutoffCopy}` },
      { n: "2", title: "Build your order",   body: `Choose from our full menu — ${menuSummary.toLowerCase()}. Full customization available.` },
      { n: "3", title: "Pay & confirm",      body: "Secure Stripe checkout. Confirmation email sent right away." },
    ];

    const itemsWithPhotos = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isActive: true, imageUrl: { not: null } },
      select: { name: true, imageUrl: true },
      orderBy: { name: "asc" },
    });

    // Up to 5 photos for the hero carousel (sliced before stripItems logic)
    const carouselSlides = itemsWithPhotos.slice(0, 5).map((i) => ({ src: i.imageUrl!, alt: i.name }));

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
    const stripItems = [...pinned, ...rest].map((i) => ({ src: i.imageUrl!, alt: i.name }));

    return (
      <>
        <SiteHeaderServer />
        <main className="app-content" id="main-content">

          {/* Hero */}
          <HeroCarousel
            slides={carouselSlides}
            gradientFrom={restaurant.darkColor ?? "#1E2C22"}
            gradientTo={restaurant.primaryColor ?? "#2C4031"}
            restaurantName={restaurantName}
            labels={labels}
            menuSummary={menuSummary}
            cutoffCopy={cutoffCopy}
          />

          {/* Food strip */}
          {stripItems.length > 0 && (
            <div style={{ padding: "20px 20px 4px" }}>
              <p style={{
                fontSize: 14, fontWeight: 700, letterSpacing: "0.22em",
                textTransform: "uppercase", color: "var(--brand-on-white)", marginBottom: 13,
                fontFamily: "var(--font-display)"
              }}>
                On the Menu
              </p>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollSnapType: "x mandatory" }}>
                {stripItems.map((item, i) => (
                  <Link key={i} href="/menu" style={{
                    flexShrink: 0, width: 90, height: 90, borderRadius: 14, overflow: "hidden",
                    position: "relative", scrollSnapAlign: "start",
                    boxShadow: "0 3px 10px rgba(var(--dark-rgb),0.18)", display: "block", textDecoration: "none",
                  }}>
                    <img src={item.src} alt={item.alt} width={90} height={90} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Feature cards — 2-up mobile, 4-up desktop */}
          <div style={{ padding: "20px 20px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="lg:grid-cols-4">
              {features.map((f) => {
                const card = (
                  <div style={{
                    background: "white", borderRadius: 16, padding: "16px 14px",
                    boxShadow: "0 1px 4px rgba(var(--dark-rgb),0.08)",
                    border: "1px solid rgba(var(--brand-rgb),0.07)", height: "100%",
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 11,
                      background: "hsl(var(--brand-h),var(--brand-s),97%)", display: "flex",
                      alignItems: "center", justifyContent: "center", marginBottom: 11
                    }}>
                      <FeatureIcon name={f.icon} />
                    </div>
                    <p style={{
                      fontSize: 14, fontWeight: 700, color: "var(--dark-bg)",
                      marginBottom: 3, fontFamily: "var(--font-display)",
                      textTransform: "uppercase", letterSpacing: "0.03em"
                    }}>
                      {f.text}
                    </p>
                    <p style={{ fontSize: 14, color: "var(--body-text,#78716c)", lineHeight: 1.4 }}>
                      {f.sub}
                    </p>
                  </div>
                );
                return f.href ? (
                  <Link key={f.text} href={f.href} style={{ textDecoration: "none", display: "block" }}>
                    {card}
                  </Link>
                ) : (
                  <div key={f.text}>{card}</div>
                );
              })}
            </div>
          </div>

          {/* How it works — vertical on mobile, horizontal 3-across at desktop */}
          <div style={{ padding: "20px 20px 28px" }}>
            <p style={{
              fontSize: 14, fontWeight: 700, letterSpacing: "0.22em",
              textTransform: "uppercase", color: "var(--brand-on-white)", marginBottom: 13,
              fontFamily: "var(--font-display)"
            }}>
              How it works
            </p>
            <div style={{
              background: "white", borderRadius: 18, overflow: "hidden",
              boxShadow: "0 1px 4px rgba(var(--dark-rgb),0.08)",
              border: "1px solid rgba(var(--brand-rgb),0.07)"
            }} className="lg:flex lg:flex-row">
              {orderSteps.map((step, i) => (
                <div key={step.n} style={{
                  display: "flex", gap: 14, padding: "16px 18px", alignItems: "flex-start",
                  borderBottom: i < orderSteps.length - 1 ? "1px solid rgba(var(--dark-rgb),0.05)" : "none"
                }} className="lg:flex-1 lg:flex-col lg:border-0 lg:border-l lg:first:border-l-0">
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: "var(--brand-on-white)", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(var(--brand-on-white-rgb),0.35)"
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "white", fontFamily: "var(--font-display)" }}>
                      {step.n}
                    </span>
                  </div>
                  <div>
                    <p style={{
                      fontSize: 14, fontWeight: 700, color: "var(--dark-bg)",
                      marginBottom: 3, fontFamily: "var(--font-display)",
                      textTransform: "uppercase", letterSpacing: "0.03em"
                    }}>
                      {step.title}
                    </p>
                    <p style={{ fontSize: 14, color: "var(--body-text,#78716c)", lineHeight: 1.55 }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SiteFooter />
        </main>
        <AppNav />
      </>
    );
  }

  // ── Platform mode (root domain) — editorial redesign ────────────────────
  //
  // The platform marketing landing page is a client component
  // (components/platform-landing.tsx) so it can run its scroll-reveal,
  // count-up, and parallax motion. The restaurant-subdomain branch above
  // is untouched and remains a server component. Previous version is
  // archived at _archive/landing-page-v10.tsx.bak.
  return <PlatformLanding />;
}

// ─── Restaurant mode icons ────────────────────────────────────────────────────

function FeatureIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    location: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    ),
    menu: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
    child: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="7" r="4"/>
        <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      </svg>
    ),
    calendar: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
      </svg>
    ),
  };
  return <>{icons[name]}</>;
}
