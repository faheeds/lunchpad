import Link from "next/link";
import Image from "next/image";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { prisma } from "@/lib/db";
import { getCurrentRestaurant } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

// ─── Platform landing page ───────────────────────────────────────────────────

const platformFeatures = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
    title: "Smart Menu Builder",
    body: "Build your full menu with photos, prices, add-ons, and removals. Go live in minutes.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
      </svg>
    ),
    title: "Cutoff Scheduling",
    body: "Set ordering deadlines per delivery date. Parents get reminder emails 24h before close.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2"/>
        <path d="M1 10h22"/>
      </svg>
    ),
    title: "Stripe Payments",
    body: "Every order paid up front via Stripe. Funds go straight to your connected account.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
    ),
    title: "Auto Confirmations",
    body: "Order confirmations, cancellation receipts, and cutoff reminders sent automatically.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Multi-School Support",
    body: "Serve any number of schools from a single dashboard. Each gets its own delivery schedule.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    title: "Live Order Dashboard",
    body: "See every order in real time. Export kitchen sheets, track payments, manage refunds.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Sign up & customize",
    body: "Create your LunchPad account, add your menu items with photos, and configure your first delivery dates — all in under 30 minutes.",
  },
  {
    step: "02",
    title: "Invite your schools",
    body: "Share your branded ordering link with parent communities. Parents sign up, add their kids, and order in seconds.",
  },
  {
    step: "03",
    title: "Deliver & get paid",
    body: "Print your kitchen sheet each morning. Stripe deposits hit your account automatically — no invoicing, no chasing payments.",
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Perfect for single-location operations just getting started.",
    features: ["Up to 2 schools", "Unlimited menu items", "Stripe payouts", "Email confirmations", "Order dashboard"],
    cta: "Start free trial",
    featured: false,
  },
  {
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "For growing operators serving multiple school communities.",
    features: ["Up to 10 schools", "Weekly batch checkout", "Cutoff reminders", "Priority support", "Everything in Starter"],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Scale",
    price: "$349",
    period: "/mo",
    description: "Enterprise-grade for large districts and multi-brand operators.",
    features: ["Unlimited schools", "Custom branding", "Dedicated onboarding", "SLA support", "Everything in Growth"],
    cta: "Contact us",
    featured: false,
  },
];

// ─── Restaurant ordering page steps ──────────────────────────────────────────

const orderSteps = [
  { n: "1", title: "Pick school & date", body: "Select your child's school and an available delivery date. Ordering closes at 9 PM the night before." },
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
      where: { isActive: true, imageUrl: { not: null } },
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
                ★ {restaurantName} ★
              </p>
              <h1 style={{
                fontSize: 38, fontWeight: 700, lineHeight: 1.0,
                color: "white", marginBottom: 10,
                fontFamily: "var(--font-display)",
                textTransform: "uppercase", letterSpacing: "0.01em"
              }}>
                <span style={{ color: "var(--accent)" }}>Hot Lunch</span>
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

  // ── Platform mode (root domain) ──────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fb", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #e8eaed",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="7" fill="#c41230"/>
            <path d="M 4 19 A 12 10 0 0 1 28 19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="10" y1="5.5" x2="22" y2="5.5" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="16" y1="5.5" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <rect x="3" y="20.5" width="26" height="5.5" rx="2.75" fill="white"/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#0f1923", letterSpacing: "-0.3px" }}>LunchPad</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/admin/login" style={{
            fontSize: 13, fontWeight: 600, color: "#4b5563", textDecoration: "none",
            padding: "6px 12px",
          }}>
            Sign in
          </Link>
          <Link href="/signup" style={{
            fontSize: 13, fontWeight: 700, color: "white", textDecoration: "none",
            padding: "8px 16px", borderRadius: 8,
            background: "linear-gradient(135deg, #c41230, #8b0d22)",
            boxShadow: "0 2px 8px rgba(196,18,48,0.35)",
          }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section style={{
        background: "linear-gradient(160deg, #0f1923 0%, #1a2d42 55%, #0f2336 100%)",
        padding: "64px 24px 0",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* Subtle grid lines */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        {/* Glow spots */}
        <div style={{
          position: "absolute", top: -80, right: -80, width: 400, height: 400,
          borderRadius: "50%", background: "rgba(196,18,48,0.12)", filter: "blur(80px)",
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: -60, width: 300, height: 300,
          borderRadius: "50%", background: "rgba(59,130,246,0.08)", filter: "blur(60px)",
        }} />

        <div style={{ position: "relative", maxWidth: 640, margin: "0 auto" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(196,18,48,0.15)", border: "1px solid rgba(196,18,48,0.3)",
            borderRadius: 100, padding: "5px 12px", marginBottom: 24,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              School lunch, fully automated
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 40, fontWeight: 900, lineHeight: 1.1,
            color: "white", marginBottom: 18,
            letterSpacing: "-0.02em",
          }}>
            The platform built for
            <br />
            <span style={{ color: "#f87171" }}>school lunch</span>{" "}
            <span style={{ color: "rgba(255,255,255,0.5)" }}>operators</span>
          </h1>

          <p style={{
            fontSize: 16, color: "rgba(255,255,255,0.62)", lineHeight: 1.65,
            marginBottom: 32, maxWidth: 480,
          }}>
            LunchPad handles ordering, payments, and delivery scheduling so you can focus on the food. Set up in a day, not a semester.
          </p>

          <div style={{ display: "flex", gap: 12, marginBottom: 48, flexWrap: "wrap" }}>
            <Link href="/signup" style={{
              padding: "14px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700,
              textDecoration: "none", color: "white",
              background: "linear-gradient(135deg, #c41230, #8b0d22)",
              boxShadow: "0 4px 20px rgba(196,18,48,0.45)",
              display: "inline-block",
            }}>
              Start your free trial
            </Link>
            <Link href="#how-it-works" style={{
              padding: "14px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              textDecoration: "none", color: "rgba(255,255,255,0.75)",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              display: "inline-block",
            }}>
              See how it works
            </Link>
          </div>

          {/* Dashboard preview card */}
          <div style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px 16px 0 0",
            overflow: "hidden",
            boxShadow: "0 -4px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}>
            {/* Window chrome */}
            <div style={{
              background: "rgba(255,255,255,0.06)", padding: "10px 16px",
              display: "flex", alignItems: "center", gap: 8,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["#ff5f57","#febc2e","#28c840"].map((c) => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />
                ))}
              </div>
              <div style={{
                flex: 1, margin: "0 12px", background: "rgba(255,255,255,0.08)",
                borderRadius: 6, padding: "4px 12px",
                fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace",
              }}>
                app.lunchpad.us/admin/orders
              </div>
            </div>

            {/* Dashboard content */}
            <div style={{ padding: "20px 20px 0", background: "#111827" }}>
              {/* Top stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Today's Orders", value: "47", delta: "+12 vs last week" },
                  { label: "Revenue", value: "$681", delta: "3 schools active" },
                  { label: "Pending Cutoff", value: "9h 22m", delta: "Closes tonight" },
                ].map((stat) => (
                  <div key={stat.label} style={{
                    background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 10px",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                      {stat.label}
                    </p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: "white", marginBottom: 2, letterSpacing: "-0.5px" }}>
                      {stat.value}
                    </p>
                    <p style={{ fontSize: 9, color: "#34d399" }}>{stat.delta}</p>
                  </div>
                ))}
              </div>

              {/* Order rows */}
              <div style={{ marginBottom: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Recent orders
                </p>
                {[
                  { name: "Emma T.", school: "Lincoln Elementary", item: "Smash Burger + Fries", amount: "$14.50", status: "PAID", color: "#34d399" },
                  { name: "Liam K.", school: "Westview Middle",    item: "Crispy Chicken Sandwich", amount: "$12.00", status: "PAID", color: "#34d399" },
                  { name: "Sophia R.", school: "Lincoln Elementary", item: "Garden Salad + Lemonade", amount: "$10.75", status: "PENDING", color: "#fbbf24" },
                ].map((order) => (
                  <div key={order.name} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: "rgba(196,18,48,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171" }}>
                          {order.name[0]}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{order.name}</p>
                        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{order.item} &middot; {order.school}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "white" }}>{order.amount}</p>
                      <span style={{
                        fontSize: 8, fontWeight: 700, color: order.color,
                        background: `${order.color}18`, borderRadius: 4, padding: "2px 6px",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <section style={{
        background: "#0f1923", padding: "28px 24px",
        borderBottom: "1px solid #1e2d3d",
      }}>
        <div style={{
          maxWidth: 640, margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
        }}>
          {[
            { value: "10,000+", label: "Orders processed" },
            { value: "200+",    label: "Schools served" },
            { value: "50+",     label: "Restaurants" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: "-0.03em", marginBottom: 2 }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section style={{ padding: "64px 24px", background: "#f8f9fb" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#c41230",
              textTransform: "uppercase", letterSpacing: "0.12em",
            }}>
              Everything you need
            </span>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0f1923", marginTop: 8, marginBottom: 12, letterSpacing: "-0.02em" }}>
              Built for operators, loved by parents
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, maxWidth: 440, margin: "0 auto" }}>
              From your first school to your fiftieth, LunchPad scales with your business.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {platformFeatures.map((feature) => (
              <div key={feature.title} style={{
                background: "white", borderRadius: 14, padding: "20px",
                border: "1px solid #e8eaed",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "#fff0f3", color: "#c41230",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 12,
                }}>
                  {feature.icon}
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0f1923", marginBottom: 5 }}>
                  {feature.title}
                </p>
                <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55 }}>
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "64px 24px", background: "white" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#c41230",
              textTransform: "uppercase", letterSpacing: "0.12em",
            }}>
              Simple setup
            </span>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0f1923", marginTop: 8, marginBottom: 12, letterSpacing: "-0.02em" }}>
              From sign-up to first delivery in a day
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {howItWorks.map((step, i) => (
              <div key={step.step} style={{
                display: "flex", gap: 20, position: "relative",
                paddingBottom: i < howItWorks.length - 1 ? 32 : 0,
              }}>
                {/* Timeline line */}
                {i < howItWorks.length - 1 && (
                  <div style={{
                    position: "absolute", left: 19, top: 44, bottom: 0,
                    width: 2, background: "linear-gradient(to bottom, #e5e7eb, transparent)",
                  }} />
                )}
                {/* Step number */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: "linear-gradient(135deg, #c41230, #8b0d22)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(196,18,48,0.3)",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "white" }}>{step.step}</span>
                </div>
                <div style={{ paddingTop: 8 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#0f1923", marginBottom: 6 }}>
                    {step.title}
                  </p>
                  <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.65 }}>
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <section style={{ padding: "64px 24px", background: "#f8f9fb" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#c41230",
              textTransform: "uppercase", letterSpacing: "0.12em",
            }}>
              Transparent pricing
            </span>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0f1923", marginTop: 8, marginBottom: 12, letterSpacing: "-0.02em" }}>
              Start free for 14 days
            </h2>
            <p style={{ fontSize: 13, color: "#6b7280" }}>No credit card required to start. Cancel anytime.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {pricingPlans.map((plan) => (
              <div key={plan.name} style={{
                background: plan.featured ? "linear-gradient(135deg, #0f1923 0%, #1a2d42 100%)" : "white",
                borderRadius: 16, padding: "24px",
                border: plan.featured ? "1px solid rgba(196,18,48,0.4)" : "1px solid #e8eaed",
                boxShadow: plan.featured ? "0 8px 32px rgba(196,18,48,0.2)" : "0 1px 3px rgba(0,0,0,0.05)",
                position: "relative", overflow: "hidden",
              }}>
                {plan.featured && (
                  <div style={{
                    position: "absolute", top: 16, right: 16,
                    background: "linear-gradient(135deg, #c41230, #8b0d22)",
                    borderRadius: 100, padding: "4px 10px",
                    fontSize: 10, fontWeight: 700, color: "white",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    Most popular
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: plan.featured ? "white" : "#0f1923" }}>
                    {plan.name}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 8 }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: plan.featured ? "white" : "#0f1923", letterSpacing: "-0.04em" }}>
                    {plan.price}
                  </span>
                  <span style={{ fontSize: 13, color: plan.featured ? "rgba(255,255,255,0.5)" : "#9ca3af" }}>
                    {plan.period}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: plan.featured ? "rgba(255,255,255,0.55)" : "#6b7280", lineHeight: 1.5, marginBottom: 16 }}>
                  {plan.description}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {plan.features.map((feat) => (
                    <div key={feat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%",
                        background: plan.featured ? "rgba(196,18,48,0.3)" : "#fff0f3",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke={plan.featured ? "#f87171" : "#c41230"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span style={{ fontSize: 12, color: plan.featured ? "rgba(255,255,255,0.75)" : "#374151" }}>
                        {feat}
                      </span>
                    </div>
                  ))}
                </div>

                <Link href="/signup" style={{
                  display: "block", textAlign: "center", padding: "13px",
                  borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none",
                  background: plan.featured ? "linear-gradient(135deg, #c41230, #8b0d22)" : "transparent",
                  color: plan.featured ? "white" : "#c41230",
                  border: plan.featured ? "none" : "2px solid #c41230",
                  boxShadow: plan.featured ? "0 4px 16px rgba(196,18,48,0.35)" : "none",
                }}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ──────────────────────────────────────────────── */}
      <section style={{
        background: "linear-gradient(135deg, #0f1923 0%, #1a2d42 100%)",
        padding: "56px 24px",
        textAlign: "center",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 500, height: 500, borderRadius: "50%",
          background: "rgba(196,18,48,0.08)", filter: "blur(60px)",
        }} />
        <div style={{ position: "relative", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: "white", marginBottom: 12, letterSpacing: "-0.02em" }}>
            Ready to modernize your lunch program?
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.58)", lineHeight: 1.65, marginBottom: 28 }}>
            Join the operators already using LunchPad to save time, eliminate payment headaches, and serve their school communities better.
          </p>
          <Link href="/signup" style={{
            display: "inline-block", padding: "15px 36px", borderRadius: 10,
            fontSize: 15, fontWeight: 700, textDecoration: "none", color: "white",
            background: "linear-gradient(135deg, #c41230, #8b0d22)",
            boxShadow: "0 4px 24px rgba(196,18,48,0.45)",
          }}>
            Start your free trial today
          </Link>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 14 }}>
            14-day free trial &middot; No credit card required &middot; Cancel anytime
          </p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer style={{
        background: "#0a1117", padding: "24px",
        borderTop: "1px solid #1a2535",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="7" fill="#c41230"/>
            <path d="M 4 19 A 12 10 0 0 1 28 19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="10" y1="5.5" x2="22" y2="5.5" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="16" y1="5.5" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <rect x="3" y="20.5" width="26" height="5.5" rx="2.75" fill="white"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>LunchPad</span>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          &copy; {new Date().getFullYear()} LunchPad. All rights reserved.
        </p>
        <div style={{ display: "flex", gap: 16 }}>
          {["Privacy", "Terms", "Contact"].map((link) => (
            <Link key={link} href="#" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
              {link}
            </Link>
          ))}
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
