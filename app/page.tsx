import Link from "next/link";
import Image from "next/image";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

// ─── Restaurant ordering page steps ──────────────────────────────────────────
//
// The platform-marketing landing page (apex domain) was redesigned in
// the v10 mockup — see _archive/landing-page-v9.tsx.bak for the previous
// version if you ever want to compare or revert. The restaurant-subdomain
// branch below is untouched.

const orderSteps = [
  { n: "1", title: "Pick location & date", body: "Select a location and an available delivery date. Ordering closes at 9 PM the night before." },
  { n: "2", title: "Build your order",   body: "Choose from our full menu — burgers, chicken, salads, sides & more. Full customization available." },
  { n: "3", title: "Pay & confirm",      body: "Secure Stripe checkout. Confirmation email sent right away." },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const restaurant = await getCurrentRestaurant();

  // ── Restaurant mode (subdomain) ──────────────────────────────────────────
  if (restaurant) {
    const restaurantName = restaurant.name;
    const schoolCount = await prisma.school.count({ where: { restaurantId: restaurant.id, isActive: true } });

    const features = [
      { text: schoolCount === 1 ? "1 school" : `${schoolCount} schools`, sub: "Fresh lunch delivered on-site", icon: "location", href: null },
      { text: "Full menu",      sub: "Burgers, salads, chicken & more",  icon: "menu",     href: "/menu"    },
      { text: "Add Your Kids",  sub: "Faster checkout every time",       icon: "child",    href: "/account" },
      { text: "Weekly planner", sub: "One checkout for the week",        icon: "calendar", href: "/weekly"  },
    ];

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
    const stripItems = [...pinned, ...rest].map((i) => ({ src: i.imageUrl!, alt: i.name }));

    return (
      <>
        <SiteHeaderServer />
        <main className="app-content">

          {/* Hero */}
          <div className="relative overflow-hidden" style={{ height: 290 }}>
            <Image
              src={restaurant.heroImageUrl ?? "/food/hero.jpeg"}
              alt={`${restaurantName} hero`}
              fill
              style={{ objectFit: "cover", objectPosition: "center top" }}
              priority
            />
            <div className="absolute inset-0" style={{
              background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 35%, rgba(var(--dark-rgb),0.72) 100%)"
            }} />
            <div className="absolute inset-0 flex flex-col justify-end" style={{ padding: "0 20px 0" }}>
              <p style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.28em",
                textTransform: "uppercase", color: "var(--hero-accent)",
                marginBottom: 6, fontFamily: "var(--font-display)"
              }}>
                ★ Fresh · Daily · Delivered ★
              </p>
              {/* Hero headline is the restaurant's own name in their
                  accent color. Previously this was hardcoded to "Hot Lunch"
                  — leftover from the platform's first single-tenant operator
                  (FS's Kitchen). For multi-tenant the restaurant name is
                  the right thing to lead with. */}
              <h1 style={{
                fontSize: 38, fontWeight: 700, lineHeight: 1.0,
                color: "white", marginBottom: 10,
                fontFamily: "var(--font-display)",
                textTransform: "uppercase", letterSpacing: "0.01em"
              }}>
                <span style={{ color: "var(--accent)" }}>{restaurantName}</span>
              </h1>
              <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginBottom: 20, lineHeight: 1.5 }}>
                Fresh food delivered to your school &mdash; order for tomorrow or plan the whole week.
              </p>
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <Link href="/order" style={{
                  padding: "12px 22px", borderRadius: 100,
                  fontSize: 13, fontWeight: 700, textDecoration: "none",
                  background: "var(--brand-on-dark)", color: "white",
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  boxShadow: "0 4px 16px rgba(var(--brand-rgb),0.45)"
                }}>
                  Order Single Day
                </Link>
                <Link href="/weekly" style={{
                  padding: "12px 20px", borderRadius: 100,
                  fontSize: 13, fontWeight: 700, textDecoration: "none",
                  background: "var(--accent)", color: "var(--dark-bg)",
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  boxShadow: "0 4px 16px rgba(var(--accent-rgb),0.40)"
                }}>
                  Plan The Week
                </Link>
              </div>
              <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.60)", letterSpacing: "0.06em", textTransform: "uppercase", paddingBottom: 14 }}>
                {restaurantName}
              </p>
            </div>
          </div>

          {/* Food strip */}
          {stripItems.length > 0 && (
            <div style={{ padding: "20px 20px 4px" }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
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
                    <img src={item.src} alt={item.alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Feature cards */}
          <div style={{ padding: "20px 20px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                      fontSize: 13, fontWeight: 700, color: "var(--dark-bg)",
                      marginBottom: 3, fontFamily: "var(--font-display)",
                      textTransform: "uppercase", letterSpacing: "0.03em"
                    }}>
                      {f.text}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--body-text,#78716c)", lineHeight: 1.4 }}>
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

          {/* How it works */}
          <div style={{ padding: "20px 20px 28px" }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
              textTransform: "uppercase", color: "var(--brand-on-white)", marginBottom: 13,
              fontFamily: "var(--font-display)"
            }}>
              How it works
            </p>
            <div style={{
              background: "white", borderRadius: 18, overflow: "hidden",
              boxShadow: "0 1px 4px rgba(var(--dark-rgb),0.08)",
              border: "1px solid rgba(var(--brand-rgb),0.07)"
            }}>
              {orderSteps.map((step, i) => (
                <div key={step.n} style={{
                  display: "flex", gap: 14, padding: "16px 18px", alignItems: "flex-start",
                  borderBottom: i < orderSteps.length - 1 ? "1px solid rgba(var(--dark-rgb),0.05)" : "none"
                }}>
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
                    <p style={{ fontSize: 12, color: "var(--body-text,#78716c)", lineHeight: 1.55 }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
        <AppNav />
      </>
    );
  }

  // ── Platform mode (root domain) — v10 redesign ──────────────────────────
  //
  // Replaces the previous landing page (archived at
  // _archive/landing-page-v9.tsx.bak). Hero is a split layout with a
  // breathing-dot eyeline on the left and a static dashboard mockup on
  // the right; brand color shifts to the platform green (#1D9E75) so
  // it's visually distinct from tenant-restaurant pages that use each
  // operator's own brand color.
  //
  // All icons are inline SVGs (Lucide-style, 24×24 viewBox) so we don't
  // pull in an icon-font CDN or change the bundle.

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>

      {/* Breathing-dot animation lives inline so it ships with the
          page on first paint — no CSS-module-vs-server-component dance. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes lp-breathe { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.5); opacity: 0.45 } }
        .lp-hero-dot { animation: lp-breathe 3.5s ease-in-out infinite }
        .lp-pcard-pop { box-shadow: 0 0 0 1.5px #1D9E75 inset }
        @media (max-width: 880px) {
          .lp-hero { grid-template-columns: 1fr !important }
          .lp-hero-right { border-top: 0.5px solid #e2e8f0 }
          .lp-hero-left { border-right: none !important }
        }
      ` }} />

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px", background: "#ffffff",
        borderBottom: "0.5px solid #e2e8f0",
      }}>
        <Link href="/" style={{
          fontSize: 17, fontWeight: 700, color: "#0f172a",
          display: "flex", alignItems: "center", gap: 8, letterSpacing: "-0.3px",
          textDecoration: "none",
        }}>
          <span style={{
            width: 28, height: 28, borderRadius: 7, background: "#1D9E75",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Bowl icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h20"/>
              <path d="M3 12a9 9 0 0 0 18 0"/>
              <path d="M12 7v-2"/>
              <path d="M9 5h6"/>
            </svg>
          </span>
          LunchPad
        </Link>

        <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#475569" }}>
          <a href="#features" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Features</a>
          <a href="#pricing" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Pricing</a>
          <a href="#testimonials" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Testimonials</a>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/login" style={{
            fontSize: 13, padding: "7px 15px", borderRadius: 8,
            border: "0.5px solid #cbd5e1", background: "transparent",
            color: "#475569", textDecoration: "none", display: "inline-flex", alignItems: "center",
          }}>
            Sign in
          </Link>
          <Link href="/signup" style={{
            fontSize: 13, fontWeight: 600, padding: "7px 15px", borderRadius: 8,
            background: "#1D9E75", color: "#ffffff",
            textDecoration: "none", display: "inline-flex", alignItems: "center",
          }}>
            Start free trial
          </Link>
        </div>
      </nav>

      {/* ── Hero (split: copy left, dashboard mockup right) ─────────── */}
      <div className="lp-hero" style={{
        display: "grid", gridTemplateColumns: "1.1fr 0.9fr",
        borderBottom: "0.5px solid #e2e8f0",
      }}>
        {/* Hero left — value prop + CTAs + trust signals */}
        <div className="lp-hero-left" style={{
          padding: "56px 32px 40px 28px",
          // Was justifyContent: "center" which produced a dead band above
          // AND below the content (the right column's dashboard fills its
          // height while the left content was vertically centered, leaving
          // matching whitespace top+bottom). space-between pushes the
          // social-proof strip to the bottom edge and keeps the headline
          // cluster pinned to the top — no awkward middle void.
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          gap: 28,
          borderRight: "0.5px solid #e2e8f0",
        }}>
          {/* TOP GROUP — eyeline through trust signals. Wrapped in a
              single flex child so space-between cleanly pushes the
              social-proof strip below to the bottom of the column. */}
          <div>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "#1D9E75",
            marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span className="lp-hero-dot" style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#1D9E75", flexShrink: 0,
            }} />
            Built for lunch operators, by a lunch operator
          </div>
          <h1 style={{
            fontSize: 44, fontWeight: 700, lineHeight: 1.1,
            color: "#0f172a", marginBottom: 14, letterSpacing: "-0.8px",
          }}>
            The platform that <em style={{ fontStyle: "normal", color: "#1D9E75" }}>runs your lunch program</em> for you.
          </h1>
          <p style={{
            fontSize: 15, color: "#475569", lineHeight: 1.7,
            marginBottom: 28, maxWidth: 380,
          }}>
            LunchPad handles ordering, payments, and delivery scheduling so you can focus on the food. Set up in a day, not a season.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
            <Link href="/signup" style={{
              background: "#1D9E75", color: "#ffffff",
              fontSize: 14, fontWeight: 600, padding: "11px 22px",
              borderRadius: 8, textDecoration: "none",
              display: "inline-flex", alignItems: "center",
            }}>
              Start free trial
            </Link>
            <a href="#features" style={{
              background: "transparent", color: "#475569",
              fontSize: 13, padding: "11px 16px",
              borderRadius: 8, border: "0.5px solid #cbd5e1",
              textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z"/>
              </svg>
              See how it works
            </a>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {["No credit card required", "Set up in a day, not a season", "No per-order fees, ever"].map((label) => (
              <div key={label} style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 12, color: "#94a3b8",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {label}
              </div>
            ))}
          </div>
          </div>

          {/* BOTTOM GROUP — social-proof strip. Pushed to the bottom of
              the left column by the parent's justify-content: space-between,
              filling what used to be a visual void below the trust signals.
              Avatar overlap + count reads as "real customers, real volume". */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex" }}>
              {[
                { initials: "SR", bg: "#1D9E75" },
                { initials: "MK", bg: "#185FA5" },
                { initials: "TL", bg: "#B85A30" },
                { initials: "JA", bg: "#534AB7" },
              ].map((a, i) => (
                <div
                  key={a.initials}
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: a.bg, color: "#ffffff",
                    fontSize: 10, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "2px solid #ffffff",
                    marginLeft: i === 0 ? 0 : -8,
                  }}
                >
                  {a.initials}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.4 }}>
              <strong style={{ color: "#0f172a", fontWeight: 700 }}>200+ operators</strong> trust LunchPad to run their lunch program.
            </div>
          </div>
        </div>

        {/* Hero right — dashboard mockup. Pure static markup so it
            ships with the initial HTML; no JS or images required. */}
        <div className="lp-hero-right" style={{
          background: "#f7f8fa", display: "flex", flexDirection: "column",
        }}>
          {/* Browser chrome */}
          <div style={{
            background: "#ffffff", borderBottom: "0.5px solid #e2e8f0",
            padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ display: "flex", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#E24B4A" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF9F27" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1D9E75" }} />
            </div>
            <div style={{
              flex: 1, background: "#f7f8fa", border: "0.5px solid #e2e8f0",
              borderRadius: 4, padding: "3px 8px", fontSize: 10, color: "#94a3b8",
              fontFamily: "'JetBrains Mono', Menlo, ui-monospace, monospace",
            }}>
              app.lunchpad.us/admin/orders
            </div>
          </div>

          {/* Dashboard body */}
          <div style={{ padding: "12px 14px", flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>
              Today's Orders
            </div>

            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 12 }}>
              <div style={{ background: "#ffffff", border: "0.5px solid #e2e8f0", borderRadius: 6, padding: "9px 10px" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                  Orders
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>47</div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 7 7 17"/><polyline points="17 17 17 7 7 7" style={{ transform: "scaleY(-1)", transformOrigin: "center" }}/>
                  </svg>
                  +12 vs last week
                </div>
              </div>
              <div style={{ background: "#ffffff", border: "0.5px solid #e2e8f0", borderRadius: 6, padding: "9px 10px" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                  Revenue
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>$681</div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  3 locations active
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1", background: "#ffffff", border: "0.5px solid #e2e8f0", borderRadius: 6, padding: "9px 10px" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                  Pending cutoff
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>9h 22m</div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#BA7517" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Closes tonight
                </div>
              </div>
            </div>

            {/* Recent orders list */}
            <div style={{
              fontSize: 9, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5,
            }}>
              Recent orders
            </div>
            <div style={{ background: "#ffffff", border: "0.5px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
              {[
                { initial: "E", color: "#1D9E75", name: "Emma T.", detail: "Smash Burger + Fries · Lincoln Elementary", price: "$14.50", status: "PAID" },
                { initial: "L", color: "#185FA5", name: "Liam K.", detail: "Crispy Chicken Sandwich · Westview Middle", price: "$12.00", status: "PAID" },
                { initial: "S", color: "#B85A30", name: "Sophia R.", detail: "Garden Salad + Lemonade · Lincoln Elementary", price: "$10.75", status: "REFUNDED" },
                { initial: "M", color: "#534AB7", name: "Marcus W.", detail: "BBQ Pulled Pork · Westview Middle", price: "$13.25", status: "PAID" },
                { initial: "A", color: "#0F6E56", name: "Ava L.", detail: "Mac & Cheese + Juice · Lincoln Elementary", price: "$9.50", status: "PAID" },
              ].map((row, i, arr) => (
                <div key={row.name} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px",
                  borderTop: i === 0 ? "none" : "0.5px solid #e2e8f0",
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: row.color, color: "#fff",
                    fontSize: 9, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {row.initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>{row.name}</div>
                    <div style={{
                      fontSize: 9, color: "#94a3b8",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {row.detail}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>{row.price}</div>
                    <span style={{
                      display: "inline-block", padding: "1px 6px", borderRadius: 20,
                      fontSize: 9, fontWeight: 700,
                      background: row.status === "PAID" ? "#E1F5EE" : "#FCEBEB",
                      color: row.status === "PAID" ? "#085041" : "#791F1F",
                    }}>
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stat bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        borderBottom: "0.5px solid #e2e8f0",
      }}>
        {[
          { n: "10,000+", l: "Orders processed" },
          { n: "200+", l: "Locations served" },
          { n: "50+", l: "Restaurants" },
        ].map((cell, i) => (
          <div key={cell.l} style={{
            padding: "22px 20px", textAlign: "center",
            borderRight: i === 2 ? "none" : "0.5px solid #e2e8f0",
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" }}>
              {cell.n}
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>{cell.l}</div>
          </div>
        ))}
      </div>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <div id="features" style={{ padding: "44px 28px", maxWidth: 680, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1D9E75", marginBottom: 8 }}>
          Features
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1.15, marginBottom: 8, letterSpacing: "-0.4px" }}>
          Built for operators, loved by their customers
        </h2>
        <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7, marginBottom: 26 }}>
          From your first location to your fiftieth, LunchPad scales with your business.
        </p>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))",
          gap: 10,
        }}>
          {[
            { n: "01", title: "Smart menu builder", desc: "Build your full menu with photos, prices, add-ons, and removals. Go live in minutes." },
            { n: "02", title: "Cutoff scheduling", desc: "Set ordering deadlines per delivery date. Customers get reminder emails 24h before close." },
            { n: "03", title: "Stripe payments", desc: "Every order paid up front via Stripe. Funds go straight to your connected account." },
            { n: "04", title: "Auto confirmations", desc: "Order confirmations, cancellation receipts, and cutoff reminders sent automatically." },
            { n: "05", title: "Multi-location support", desc: "Serve any number of locations from a single dashboard, each with its own delivery schedule." },
            { n: "06", title: "Live order dashboard", desc: "See every order in real time. Export kitchen sheets, track payments, manage refunds." },
            { n: "07", title: "Auto label printing", desc: "Print individual kitchen labels for every order — name, allergens, add-ons. No manual sorting." },
            { n: "08", title: "Discount module", desc: "Create promo codes, percentage or flat discounts, and set usage limits — applied automatically at checkout." },
            { n: "09", title: "Multi-day checkout", desc: "Customers can order across multiple delivery dates in a single checkout — fewer drop-offs, more committed orders." },
          ].map((f) => (
            <div key={f.n} style={{
              border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 18, background: "#ffffff",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1D9E75", marginBottom: 10 }}>{f.n}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 5 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <div id="testimonials" style={{
        background: "#f7f8fa", borderTop: "0.5px solid #e2e8f0",
        borderBottom: "0.5px solid #e2e8f0", padding: "40px 28px",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1D9E75", marginBottom: 6 }}>
            Testimonials
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", marginBottom: 18, letterSpacing: "-0.4px" }}>
            Operators love it
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))",
            gap: 12,
          }}>
            {[
              { initials: "SR", quote: "I used to spend 2 hours every Friday collecting orders in a Google Form. Now I spend 10 minutes on LunchPad.", name: "Sarah R.", role: "School lunch coordinator" },
              { initials: "MK", quote: "The cutoff feature saved us from hundreds of last-minute headaches. Setup took under an hour.", name: "Marcus K.", role: "Corporate catering operator" },
              { initials: "TL", quote: "Software that actually understands a lunch program. Not some generic food ordering app.", name: "Tanya L.", role: "District food services" },
            ].map((t) => (
              <div key={t.initials} style={{
                background: "#ffffff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 18,
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <div style={{ display: "flex", gap: 2 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="#EF9F27" aria-hidden="true">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
                    </svg>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.6, margin: 0 }}>
                  "{t.quote}"
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", background: "#1D9E75",
                    color: "#ffffff", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <div id="pricing" style={{ padding: "44px 28px 52px", maxWidth: 680, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1D9E75", marginBottom: 8 }}>
          Pricing
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1.15, marginBottom: 8, letterSpacing: "-0.4px" }}>
          Start free for 14 days
        </h2>
        <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7, marginBottom: 26 }}>
          No credit card required to start. Cancel anytime.
        </p>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
          gap: 10, alignItems: "stretch",
        }}>
          {[
            { name: "Starter", price: 49, desc: "Perfect for single-location operations just getting started.", feats: ["Up to 2 locations", "Unlimited menu items", "Stripe payouts", "Email confirmations", "Order dashboard"], pop: false },
            { name: "Growth", price: 149, desc: "For growing operators serving multiple locations.", feats: ["Up to 10 locations", "Weekly batch checkout", "Cutoff reminders", "Priority support", "Everything in Starter"], pop: true },
            { name: "Scale", price: 349, desc: "Enterprise-grade for large districts and multi-brand operators.", feats: ["Unlimited locations", "Custom branding", "Dedicated onboarding", "SLA support", "Everything in Growth"], pop: false },
          ].map((p) => (
            <div key={p.name} className={p.pop ? "lp-pcard-pop" : undefined} style={{
              border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 20,
              background: "#ffffff", display: "flex", flexDirection: "column",
              position: "relative",
            }}>
              {p.pop && (
                <span style={{
                  position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                  background: "#1D9E75", color: "#ffffff",
                  fontSize: 11, fontWeight: 700, padding: "3px 12px",
                  borderRadius: 20, whiteSpace: "nowrap",
                }}>
                  Most popular
                </span>
              )}
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: "#0f172a", lineHeight: 1, letterSpacing: "-0.5px" }}>
                <sup style={{ fontSize: 15, verticalAlign: "top", marginTop: 6, display: "inline-block", fontWeight: 600 }}>$</sup>
                {p.price}
                <sub style={{ fontSize: 12, fontWeight: 400, color: "#475569", letterSpacing: 0 }}>/mo</sub>
              </div>
              <div style={{
                fontSize: 12, color: "#475569", margin: "10px 0 12px",
                lineHeight: 1.5, paddingBottom: 12,
                borderBottom: "0.5px solid #e2e8f0",
              }}>
                {p.desc}
              </div>
              <div style={{ flex: 1 }}>
                {p.feats.map((feat) => (
                  <div key={feat} style={{
                    display: "flex", alignItems: "flex-start", gap: 6,
                    fontSize: 12, color: "#475569", marginBottom: 6,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {feat}
                  </div>
                ))}
              </div>
              <Link href="/signup" style={{
                width: "100%", marginTop: 16, padding: "9px 0",
                fontSize: 13, fontWeight: 600, borderRadius: 8,
                textAlign: "center", textDecoration: "none",
                ...(p.pop
                  ? { background: "#1D9E75", color: "#ffffff", border: "0.5px solid #1D9E75" }
                  : { background: "transparent", color: "#0f172a", border: "0.5px solid #cbd5e1" }),
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                Start free trial
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA strip ─────────────────────────────────────────── */}
      <div style={{
        borderTop: "0.5px solid #e2e8f0", padding: "44px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 20, flexWrap: "wrap",
      }}>
        <div>
          <h3 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 6, letterSpacing: "-0.3px" }}>
            Ready to modernize your lunch program?
          </h3>
          <p style={{ fontSize: 13, color: "#475569" }}>
            Join operators already using LunchPad to save time, eliminate payment headaches, and serve their customers better.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <a href="#features" style={{
            background: "transparent", color: "#475569",
            fontSize: 13, padding: "11px 16px",
            borderRadius: 8, border: "0.5px solid #cbd5e1",
            textDecoration: "none", display: "inline-flex", alignItems: "center",
          }}>
            See how it works
          </a>
          <Link href="/signup" style={{
            background: "#1D9E75", color: "#ffffff",
            fontSize: 13, fontWeight: 600, padding: "11px 22px",
            borderRadius: 8, textDecoration: "none",
            display: "inline-flex", alignItems: "center",
          }}>
            Start free trial today
          </Link>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{
        padding: "18px 28px", display: "flex",
        justifyContent: "space-between", alignItems: "center",
        borderTop: "0.5px solid #e2e8f0", flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          © {new Date().getFullYear()} LunchPad. All rights reserved.
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#475569" }}>
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms</Link>
          <Link href="/contact" style={{ color: "inherit", textDecoration: "none" }}>Contact</Link>
        </div>
      </footer>
    </div>
  );
}

// ─── Restaurant mode icons ────────────────────────────────────────────────────

function FeatureIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    location: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    ),
    menu: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
    child: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="4"/>
        <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      </svg>
    ),
    calendar: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--brand-on-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
      </svg>
    ),
  };
  return <>{icons[name]}</>;
}
