import Link from "next/link";
import Image from "next/image";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { getLabelsForOperator } from "@/lib/location-labels";
import { PLAN_LIMITS } from "@/lib/plans";

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
    // Restaurant-wide label set — drives "school" vs "office" vs
    // neutral (hybrid) copy across the tenant landing page.
    const labels = getLabelsForOperator(restaurant.operatorType);

    const features = [
      { text: schoolCount === 1 ? `1 ${labels.type.toLowerCase()}` : `${schoolCount} ${labels.typePlural.toLowerCase()}`, sub: `Fresh lunch delivered on-site`, icon: "location", href: null },
      { text: "Full menu",      sub: "Burgers, salads, chicken & more",  icon: "menu",     href: "/menu"    },
      { text: labels.unit === "Student" ? "Add Your Kids" : `Save ${labels.unitPlural}`,  sub: "Faster checkout every time",       icon: "child",    href: "/account" },
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
        <main className="app-content" id="main-content">

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
                Fresh food delivered to your {labels.type.toLowerCase()} &mdash; order for tomorrow or plan the whole week.
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

  // ── Platform mode (root domain) — Operator-first redesign ─────────────────
  // Plain-language landing page for small lunch operators.
  // All styles are inline so they ship on first paint; mobile rules
  // live in the <style> tag scoped to .lp-* classes.

  const starterPlan = PLAN_LIMITS.STARTER;
  const growthPlan = PLAN_LIMITS.GROWTH;
  const scalePlan = PLAN_LIMITS.SCALE;

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 640px) {
          .lp-nav { padding: 12px 16px !important; gap: 10px !important; flex-wrap: wrap; }
          .lp-nav-center { display: none !important; }
          .lp-nav-cta { gap: 6px !important; flex-wrap: wrap; }
          .lp-nav-cta a, .lp-nav-cta button { padding: 7px 11px !important; font-size: 12px !important; }

          .lp-hero { flex-direction: column !important; gap: 20px !important; padding: 24px 16px !important; }
          .lp-hero-h1 { font-size: 28px !important; line-height: 1.2 !important; }
          .lp-hero-sub { font-size: 13px !important; }
          .lp-hero-cta { gap: 8px !important; flex-wrap: wrap; }
          .lp-hero-cta > a { flex: 1; min-width: 140px; }

          .lp-section { padding-left: 16px !important; padding-right: 16px !important; }
          .lp-section-h2 { font-size: 22px !important; line-height: 1.2 !important; }

          .lp-operator-section { flex-direction: column !important; text-align: center !important; gap: 20px !important; padding: 28px 16px !important; }
          .lp-operator-avatar { margin: 0 auto !important; }

          .lp-testimonials { grid-template-columns: 1fr !important; }

          .lp-pricing-grid { grid-template-columns: 1fr !important; }

          .lp-footer { flex-direction: column !important; text-align: center !important; gap: 16px !important; padding: 24px 16px !important; }
          .lp-footer-links { flex-direction: column !important; gap: 12px !important; }
        }
      ` }} />

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12h20"/>
              <path d="M3 12a9 9 0 0 0 18 0"/>
              <path d="M12 7v-2"/>
              <path d="M9 5h6"/>
            </svg>
          </span>
          LunchPad
        </Link>

        <div className="lp-nav-center" style={{ display: "flex", gap: 24, fontSize: 13, color: "#475569" }}>
          <a href="#features" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Features</a>
          <a href="#pricing" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Pricing</a>
          <a href="#story" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Story</a>
        </div>

        <div className="lp-nav-cta" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="tel:+18005558624" style={{
            fontSize: 13, color: "#475569", textDecoration: "none",
            display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            (800) 555-LUNCH
          </a>
          <Link href="/signup" style={{
            fontSize: 13, fontWeight: 600, padding: "7px 15px", borderRadius: 8,
            background: "#1D9E75", color: "#ffffff",
            textDecoration: "none", display: "inline-flex", alignItems: "center",
            whiteSpace: "nowrap",
          }}>
            Start free trial
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <div className="lp-hero" style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "60px 28px", background: "#ffffff",
        borderBottom: "0.5px solid #e2e8f0", textAlign: "center",
      }}>
        {/* Audience strip */}
        <div style={{
          fontSize: 12, fontWeight: 600, color: "#475569",
          marginBottom: 20, letterSpacing: "0.05em",
        }}>
          Schools · offices · gyms · care homes · catering
        </div>

        {/* Headline */}
        <h1 className="lp-hero-h1" style={{
          fontSize: 48, fontWeight: 700, lineHeight: 1.1,
          color: "#0f172a", marginBottom: 16, letterSpacing: "-0.8px",
          maxWidth: 650,
        }}>
          Everything you need to run a lunch business
        </h1>

        {/* Subhead */}
        <p className="lp-hero-sub" style={{
          fontSize: 16, color: "#475569", lineHeight: 1.6,
          marginBottom: 28, maxWidth: 550,
        }}>
          {`Built for small operators. Ordering, payments, kitchen prep — done. $${starterPlan.priceMonthly}/month, no contracts. Free for 14 days.`}
        </p>

        {/* CTAs */}
        <div className="lp-hero-cta" style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <Link href="/signup" style={{
            background: "#1D9E75", color: "#ffffff",
            fontSize: 14, fontWeight: 600, padding: "12px 24px",
            borderRadius: 8, textDecoration: "none",
            display: "inline-flex", alignItems: "center",
          }}>
            Start free trial
          </Link>
          <a href="#features" style={{
            background: "transparent", color: "#1D9E75",
            fontSize: 14, fontWeight: 600, padding: "12px 24px",
            borderRadius: 8, border: "1px solid #1D9E75",
            textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z"/>
            </svg>
            See how it works
          </a>
        </div>

        {/* Trust signals */}
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          No credit card. Cancel anytime. English & Spanish.
        </div>
      </div>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <div id="features" className="lp-section" style={{ padding: "44px 28px", maxWidth: 920, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1D9E75", marginBottom: 8 }}>
          Features
        </div>
        <h2 className="lp-section-h2" style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1.15, marginBottom: 26, letterSpacing: "-0.4px" }}>
          Everything operators actually need
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {[
            { n: "01", title: "Smart menu builder", desc: "Build your full menu with photos, prices, add-ons, and removals. Go live in minutes." },
            { n: "02", title: "Cutoffs & auto emails", desc: "Set deadlines per delivery date. Order confirmations, cutoff reminders, and receipts go out automatically." },
            { n: "03", title: "Stripe payments", desc: "Every order paid up front via Stripe. Funds go straight to your account." },
            { n: "04", title: "Multi-location", desc: "Serve any number of locations from a single dashboard, each with its own delivery schedule." },
            { n: "05", title: "Live order dashboard", desc: "See every order in real time. Export kitchen sheets, track payments, manage refunds." },
            { n: "06", title: "Auto label printing", desc: "Print kitchen labels for every order — name, allergens, add-ons. No manual sorting." },
            { n: "07", title: "Discount module", desc: "Create promo codes with percentage or flat discounts and usage limits." },
            { n: "08", title: "Multi-day checkout", desc: "Customers order across multiple dates in one checkout — fewer drop-offs, more committed orders." },
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

      {/* ── Built by an operator ──────────────────────────────────────── */}
      <div className="lp-operator-section" style={{
        background: "#E1F5EE", padding: "48px 28px",
        display: "flex", alignItems: "center", gap: 32,
        maxWidth: 920, margin: "0 auto",
      }}>
        <div className="lp-operator-avatar" style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "#1D9E75", color: "#ffffff",
          fontSize: 28, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          FS
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "#1D9E75", marginBottom: 8,
          }}>
            Built by an operator
          </div>
          <p style={{
            fontSize: 15, color: "#0f172a", lineHeight: 1.7, marginBottom: 12,
            fontStyle: "italic",
          }}>
            "I started LunchPad because I was running a lunch program myself — texting parents on Sundays, matching Venmo to orders on a spreadsheet, writing prep sheets by hand. I built what I needed. Now hundreds of operators use it."
          </p>
          <div style={{ fontSize: 12, color: "#475569" }}>
            <strong style={{ color: "#0f172a", fontWeight: 700 }}>Faheed</strong>, founder · ran a 200-lunch-a-week program before building LunchPad
          </div>
        </div>
      </div>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <div id="story" className="lp-section" style={{
        background: "#f7f8fa", borderTop: "0.5px solid #e2e8f0",
        borderBottom: "0.5px solid #e2e8f0", padding: "40px 28px",
      }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div className="lp-testimonials" style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}>
            {[
              { initials: "SR", quote: "I used to spend 2 hours every Friday collecting orders in a Google Form. Now I spend 10 minutes on LunchPad.", name: "Sarah R.", role: "School lunch coordinator, San Diego" },
              { initials: "MK", quote: "The cutoff feature saved us from hundreds of last-minute headaches. Setup took under an hour.", name: "Marcus K.", role: "Office catering operator, Austin" },
            ].map((t) => (
              <div key={t.initials} style={{
                background: "#ffffff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 20,
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <p style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.6, margin: 0 }}>
                  "{t.quote}"
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#1D9E75",
                    color: "#ffffff", fontSize: 12, fontWeight: 700,
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
      <div id="pricing" className="lp-section" style={{ padding: "44px 28px 52px", maxWidth: 920, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1D9E75", marginBottom: 8 }}>
          Pricing
        </div>
        <h2 className="lp-section-h2" style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1.15, marginBottom: 8, letterSpacing: "-0.4px" }}>
          Simple, honest pricing
        </h2>
        <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7, marginBottom: 26 }}>
          $49/month to start. 14-day free trial, no credit card.
        </p>
        <div className="lp-pricing-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16, alignItems: "stretch",
        }}>
          {/* Starter */}
          <div style={{
            border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 20,
            background: "#ffffff", display: "flex", flexDirection: "column",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{starterPlan.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1, letterSpacing: "-0.5px", marginBottom: 2 }}>
              ${starterPlan.priceMonthly}
              <span style={{ fontSize: 12, fontWeight: 400, color: "#475569" }}> /mo</span>
            </div>
            <div style={{
              fontSize: 12, color: "#475569", margin: "12px 0 16px",
              lineHeight: 1.5, paddingBottom: 16,
              borderBottom: "0.5px solid #e2e8f0",
            }}>
              Perfect for single-location operations.
            </div>
            <div style={{ flex: 1, marginBottom: 16 }}>
              {["Up to 1 location", "Unlimited menu items", "Stripe payouts", "Email support", "14-day free trial"].map((bullet) => (
                <div key={bullet} style={{
                  display: "flex", alignItems: "flex-start", gap: 6,
                  fontSize: 12, color: "#475569", marginBottom: 8,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {bullet}
                </div>
              ))}
            </div>
            <Link href="/signup" style={{
              width: "100%", padding: "9px 0",
              fontSize: 13, fontWeight: 600, borderRadius: 8,
              textAlign: "center", textDecoration: "none",
              background: "transparent", color: "#0f172a", border: "0.5px solid #cbd5e1",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              Start free trial
            </Link>
          </div>

          {/* Growth — Most Popular */}
          <div style={{
            border: "2px solid #1D9E75", borderRadius: 12, padding: 20,
            background: "#ffffff", display: "flex", flexDirection: "column",
            position: "relative",
          }}>
            <div style={{
              position: "absolute", top: -12, left: 0, right: 0,
              display: "flex", justifyContent: "center",
            }}>
              <span style={{
                background: "#1D9E75", color: "#ffffff",
                fontSize: 11, fontWeight: 700, padding: "3px 12px",
                borderRadius: 20, whiteSpace: "nowrap",
              }}>
                Most popular
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{growthPlan.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1, letterSpacing: "-0.5px", marginBottom: 2 }}>
              ${growthPlan.priceMonthly}
              <span style={{ fontSize: 12, fontWeight: 400, color: "#475569" }}> /mo</span>
            </div>
            <div style={{
              fontSize: 12, color: "#475569", margin: "12px 0 16px",
              lineHeight: 1.5, paddingBottom: 16,
              borderBottom: "0.5px solid #e2e8f0",
            }}>
              For growing operators with multiple locations.
            </div>
            <div style={{ flex: 1, marginBottom: 16 }}>
              {["Up to 5 locations", "Weekly multi-day checkout", "Cutoff reminders", "Priority support", "Everything in Starter"].map((bullet) => (
                <div key={bullet} style={{
                  display: "flex", alignItems: "flex-start", gap: 6,
                  fontSize: 12, color: "#475569", marginBottom: 8,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {bullet}
                </div>
              ))}
            </div>
            <Link href="/signup" style={{
              width: "100%", padding: "9px 0",
              fontSize: 13, fontWeight: 600, borderRadius: 8,
              textAlign: "center", textDecoration: "none",
              background: "#1D9E75", color: "#ffffff", border: "0.5px solid #1D9E75",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              Start free trial
            </Link>
          </div>

          {/* Scale */}
          <div style={{
            border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 20,
            background: "#ffffff", display: "flex", flexDirection: "column",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{scalePlan.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1, letterSpacing: "-0.5px", marginBottom: 2 }}>
              ${scalePlan.priceMonthly}
              <span style={{ fontSize: 12, fontWeight: 400, color: "#475569" }}> /mo</span>
            </div>
            <div style={{
              fontSize: 12, color: "#475569", margin: "12px 0 16px",
              lineHeight: 1.5, paddingBottom: 16,
              borderBottom: "0.5px solid #e2e8f0",
            }}>
              Enterprise for large districts and multi-brand operators.
            </div>
            <div style={{ flex: 1, marginBottom: 16 }}>
              {["Unlimited locations", "Custom branding", "Dedicated onboarding", "SLA support", "Everything in Growth"].map((bullet) => (
                <div key={bullet} style={{
                  display: "flex", alignItems: "flex-start", gap: 6,
                  fontSize: 12, color: "#475569", marginBottom: 8,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {bullet}
                </div>
              ))}
            </div>
            <Link href="/signup" style={{
              width: "100%", padding: "9px 0",
              fontSize: 13, fontWeight: 600, borderRadius: 8,
              textAlign: "center", textDecoration: "none",
              background: "transparent", color: "#0f172a", border: "0.5px solid #cbd5e1",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              Start free trial
            </Link>
          </div>
        </div>
        <div style={{
          fontSize: 12, color: "#475569", textAlign: "center", marginTop: 24,
        }}>
          Every plan: 14-day free trial · no credit card · cancel anytime · English & Spanish
        </div>
      </div>

      {/* ── Bottom CTA ───────────────────────────────────────────────── */}
      <div className="lp-bottom-cta" style={{
        borderTop: "0.5px solid #e2e8f0", padding: "44px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 20, flexWrap: "wrap",
      }}>
        <div>
          <h3 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginBottom: 6, letterSpacing: "-0.3px" }}>
            Ready to run your lunch program better?
          </h3>
          <p style={{ fontSize: 13, color: "#475569" }}>
            Join operators already using LunchPad to save time, eliminate payment headaches, and focus on the food.
          </p>
        </div>
        <div className="lp-bottom-cta-buttons" style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <a href="#features" style={{
            background: "transparent", color: "#475569",
            fontSize: 13, padding: "11px 16px",
            borderRadius: 8, border: "0.5px solid #cbd5e1",
            textDecoration: "none", display: "inline-flex", alignItems: "center",
            whiteSpace: "nowrap",
          }}>
            See how it works
          </a>
          <Link href="/signup" style={{
            background: "#1D9E75", color: "#ffffff",
            fontSize: 13, fontWeight: 600, padding: "11px 22px",
            borderRadius: 8, textDecoration: "none",
            display: "inline-flex", alignItems: "center",
            whiteSpace: "nowrap",
          }}>
            Start free trial
          </Link>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="lp-footer" style={{
        padding: "32px 28px", background: "#0f172a", color: "#ffffff",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        flexWrap: "wrap", gap: 20,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14, fontWeight: 700 }}>
            <span style={{
              width: 24, height: 24, borderRadius: 6, background: "#1D9E75",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12h20"/>
                <path d="M3 12a9 9 0 0 0 18 0"/>
                <path d="M12 7v-2"/>
                <path d="M9 5h6"/>
              </svg>
            </span>
            LunchPad
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Made for the operators who feed real people.
          </div>
        </div>
        <div className="lp-footer-links" style={{ display: "flex", gap: 20, fontSize: 12, color: "#cbd5e1" }}>
          <a href="#features" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Features</a>
          <a href="#pricing" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Pricing</a>
          <a href="#story" style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}>Story</a>
          <Link href="/admin/login" style={{ color: "inherit", textDecoration: "none" }}>Sign in</Link>
          <a href="tel:+18005558624" style={{ color: "inherit", textDecoration: "none" }}>(800) 555-LUNCH</a>
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
