import Link from "next/link";
import Image from "next/image";
import type { Restaurant } from "@prisma/client";
import type { LandingView } from "@/lib/landing-content";

/**
 * Landing page v2. Pure presentation: every decision about what appears
 * (and what is hidden) is made in lib/landing-content.ts so all restaurants
 * share one layout. Colors come from the tenant's brand settings.
 */

/**
 * next/image only accepts hosts allow-listed in next.config (Vercel Blob).
 * Anything else (e.g. a photo served from the tenant's own /public folder
 * by absolute URL) falls back to a plain <img> so it can never crash the page.
 */
function LandingImage({
  src, alt, sizes, priority,
}: { src: string; alt: string; sizes?: string; priority?: boolean }) {
  const optimizable = src.startsWith("/") || /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(src);
  if (optimizable) {
    return <Image src={src} alt={alt} fill priority={priority} sizes={sizes} style={{ objectFit: "cover" }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
}

function dateChip(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

export function RestaurantLanding({ restaurant, view }: { restaurant: Restaurant; view: LandingView }) {
  const dark = restaurant.darkColor ?? "#1E2C22";
  const accent = restaurant.accentColor ?? "#C0673E";
  const highlight = restaurant.heroAccentColor ?? "#fbbf24";
  const display = "var(--font-display)";
  const { hero, status, steps, featured, menuBoard, pickups, story, footer } = view;
  const hasFeatured = featured.length > 0;

  const eyebrow: React.CSSProperties = {
    margin: 0,
    fontFamily: display,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
  };
  const h2: React.CSSProperties = {
    margin: 0,
    fontFamily: display,
    fontWeight: 800,
    lineHeight: 1.02,
    letterSpacing: "-0.025em",
    textWrap: "balance",
  };
  const pill = (bg: string, color: string, border?: string): React.CSSProperties => ({
    display: "inline-block",
    background: bg,
    color,
    border: border ?? "none",
    fontFamily: display,
    fontWeight: 700,
    fontSize: 17,
    padding: "15px 30px",
    borderRadius: 999,
    textDecoration: "none",
    textAlign: "center",
  });

  return (
    <div className="landing-v2" style={{ background: dark, color: "#F7EFE6", lineHeight: 1.55 }}>
      <style>{`
        .lp-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:640px}
        .lp-hero-photo{position:relative;min-height:380px}
        .lp-h1{font-size:clamp(2.6rem,7vw,5.5rem)}
        .lp-chip{display:inline-flex;align-items:center;gap:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:14px;padding:10px 16px;max-width:100%;font-size:15px;line-height:1.35}
        .lp-chip-dot{width:10px;height:10px;border-radius:50%;background:#59D186;flex-shrink:0}
        .lp-chip-text{display:flex;flex-wrap:wrap;align-items:baseline;row-gap:2px}
        .lp-chip-text>span{white-space:nowrap}
        .lp-chip-text>span+span::before{content:"\\00b7";margin:0 8px;opacity:.7}
        .lp-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px}
        .lp-mosaic{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}
        .lp-tile{position:relative;border-radius:18px;overflow:hidden;display:block;min-height:260px;color:#fff;text-decoration:none}
        .lp-t1{grid-column:span 6;grid-row:span 2;min-height:540px}
        .lp-t2{grid-column:span 6}
        .lp-t3,.lp-t4{grid-column:span 3}
        .lp-only1 .lp-t1,.lp-only2 .lp-t1{grid-column:span 12;grid-row:auto;min-height:420px}
        .lp-only2 .lp-t2{grid-column:span 12}
        @media (max-width:860px){
          .lp-steps{grid-template-columns:repeat(2,minmax(0,1fr))}
          .lp-hero{grid-template-columns:1fr}
          .lp-hero-photo{order:-1;min-height:300px}
          .lp-mosaic{grid-template-columns:1fr 1fr}
          .lp-t1{grid-column:span 2;grid-row:auto;min-height:300px}
          .lp-t2{grid-column:span 2;min-height:240px}
          .lp-t3,.lp-t4{grid-column:span 1;min-height:200px}
          .lp-only1 .lp-t1,.lp-only2 .lp-t1,.lp-only2 .lp-t2{grid-column:span 2}
        }
        @media (max-width:520px){
          .lp-steps{grid-template-columns:1fr}
          .lp-chip{align-items:flex-start;border-radius:16px}
          .lp-chip-dot{margin-top:6px}
          .lp-chip-text{flex-direction:column}
          .lp-chip-text>span+span::before{content:none}
        }
      `}</style>

      {/* Hero */}
      <section className="lp-hero">
        <div style={{ padding: "72px clamp(20px,4vw,56px)", display: "flex", flexDirection: "column", justifyContent: "center", gap: 24 }}>
          <p style={{ ...eyebrow, color: highlight }}>{hero.eyebrow}</p>
          <h1 className="lp-h1" style={{ ...h2, color: "#fff", lineHeight: 0.97 }}>{hero.headline}</h1>
          <p style={{ margin: 0, fontSize: 19, color: "#E8DDD2", maxWidth: 540 }}>{hero.subtitle}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/order" style={pill(accent, "#fff")}>Order now</Link>
            {view.showWeekly && (
              <Link href="/weekly" style={pill("transparent", "#fff", "2px solid rgba(255,255,255,0.7)")}>Plan the week</Link>
            )}
          </div>
          {status && (
            <div className="lp-chip">
              <span aria-hidden className="lp-chip-dot" />
              <span className="lp-chip-text">
                <span>Ordering open</span>
                <span>Next day <strong>{dateChip(status.nextDate)}</strong></span>
                {status.cutoffLabel ? <span>Order by {status.cutoffLabel}</span> : null}
              </span>
            </div>
          )}
        </div>
        <div className="lp-hero-photo">
          {hero.imageUrl ? (
            <LandingImage src={hero.imageUrl} alt={restaurant.name} priority sizes="(max-width:860px) 100vw, 50vw" />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${restaurant.primaryColor ?? dark}, ${accent})` }} />
          )}
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ background: "#FAF7F2", color: "#1A1412", padding: "72px clamp(20px,4vw,56px)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 40 }}>
          <h2 style={{ ...h2, fontSize: "clamp(2rem,4.5vw,3.2rem)" }}>How it works</h2>
          <div className="lp-steps">
            {steps.map((s, i) => (
              <div key={s.title} style={{ borderTop: "3px solid #1A1412", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: display, fontWeight: 800, fontSize: 14, letterSpacing: "0.14em", color: accent }}>{String(i + 1).padStart(2, "0")}</span>
                <h3 style={{ margin: 0, fontFamily: display, fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>{s.title}</h3>
                <p style={{ margin: 0, color: "#5E524B", fontSize: 16 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plan the week */}
      {view.showWeekly && (
        <section style={{ background: accent, color: "#fff", padding: "72px clamp(20px,4vw,56px)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}>
            <p style={{ ...eyebrow, color: "rgba(255,255,255,0.8)" }}>Save time</p>
            <h2 style={{ ...h2, fontSize: "clamp(2.2rem,5vw,4rem)" }}>Plan the week. One checkout.</h2>
            <p style={{ margin: 0, fontSize: 19, maxWidth: 560 }}>Choose for every day at once, check out once, and skip the daily scramble. Change a day any time before the cutoff.</p>
            <Link href="/weekly" style={pill("#111", "#fff")}>Plan the week</Link>
          </div>
        </section>
      )}

      {/* Featured dishes */}
      {hasFeatured && (
        <section style={{ padding: "80px clamp(20px,4vw,56px) 56px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ ...eyebrow, color: highlight }}>Favorites</p>
                <h2 style={{ ...h2, fontSize: "clamp(2rem,5vw,3.6rem)", color: "#fff" }}>Made fresh for you.</h2>
              </div>
              <Link href="/menu" style={pill("transparent", "#fff", "2px solid rgba(255,255,255,0.6)")}>View full menu</Link>
            </div>
            <div className={`lp-mosaic ${featured.length === 1 ? "lp-only1" : featured.length === 2 ? "lp-only2" : ""}`}>
              {featured.map((f, i) => (
                <Link key={f.slug} href={`/order?item=${encodeURIComponent(f.slug)}`} className={`lp-tile lp-t${i + 1}`}>
                  <LandingImage src={f.imageUrl} alt={f.name} sizes="(max-width:860px) 100vw, 50vw" />
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "70px 20px 18px", background: "linear-gradient(to top, rgba(20,14,12,0.9), rgba(20,14,12,0))" }}>
                    <p style={{ margin: 0, fontFamily: display, fontWeight: 800, fontSize: i === 0 ? 30 : 21, lineHeight: 1.1 }}>{f.name}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 15 }}>{f.priceLabel}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Menu board */}
      {menuBoard.length > 0 && (
        <section id="menu" style={{ padding: "24px clamp(20px,4vw,56px) 80px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 56, display: "flex", flexDirection: "column", gap: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
              <h2 style={{ ...h2, fontSize: "clamp(2rem,4.5vw,3.2rem)", color: "#fff" }}>The menu</h2>
              <Link href="/order" style={pill(accent, "#fff")}>Order from the menu</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: "40px 56px" }}>
              {menuBoard.map((cat) => (
                <div key={cat.name} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h3 style={{ margin: "0 0 4px", fontFamily: display, fontWeight: 700, fontSize: 24, color: highlight }}>{cat.name}</h3>
                  {cat.items.map((it) => (
                    <div key={it.name} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <span>{it.name}</span>
                      <span style={{ color: "#D4C8BC", whiteSpace: "nowrap" }}>{it.priceLabel}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pickup / delivery dates */}
      {pickups.length > 0 && (
        <section style={{ background: "#FAF7F2", color: "#1A1412", padding: "72px clamp(20px,4vw,56px)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
            <h2 style={{ ...h2, fontSize: "clamp(2rem,4.5vw,3.2rem)" }}>Coming up</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(340px,100%),1fr))", gap: 20 }}>
              {pickups.map((p) => (
                <div key={p.name} style={{ background: "#fff", border: "1px solid #E9DFD3", borderRadius: 18, padding: 26, display: "flex", flexDirection: "column", gap: 12 }}>
                  <h3 style={{ margin: 0, fontFamily: display, fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>{p.name}</h3>
                  {p.cutoffLabel && <p style={{ margin: 0, color: "#5E524B", fontSize: 14 }}>Orders close at {p.cutoffLabel}</p>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {p.dates.slice(0, 6).map((d) => (
                      <span key={d} style={{ background: "#1A1412", color: "#fff", fontWeight: 700, fontSize: 14, padding: "8px 14px", borderRadius: 999 }}>{dateChip(d)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Link href="/order" style={{ ...pill(accent, "#fff"), width: "fit-content" }}>Choose your day</Link>
          </div>
        </section>
      )}

      {/* Story */}
      {story && (
        <section style={{ padding: "88px clamp(20px,4vw,56px)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: story.imageUrl ? "repeat(auto-fit,minmax(min(400px,100%),1fr))" : "minmax(0,720px)", gap: 56, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <p style={{ ...eyebrow, color: highlight }}>Our story</p>
              <h2 style={{ ...h2, fontSize: "clamp(2rem,4.5vw,3.4rem)", color: "#fff" }}>{story.headline}</h2>
              {story.body.split(/\n{2,}/).map((para) => (
                <p key={para} style={{ margin: 0, fontSize: 19, color: "#E8DDD2", maxWidth: 560 }}>{para}</p>
              ))}
            </div>
            {story.imageUrl && (
              <div style={{ position: "relative", minHeight: 400, borderRadius: 20, overflow: "hidden" }}>
                <LandingImage src={story.imageUrl} alt={restaurant.name} sizes="(max-width:860px) 100vw, 50vw" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Visit / contact */}
      {(footer.address || footer.hours.length > 0 || footer.phone || footer.email || footer.instagramUrl || footer.facebookUrl) && (
        <section id="visit" style={{ background: "#120D0B", padding: "64px clamp(20px,4vw,56px)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: 36 }}>
            {(footer.address || footer.hours.length > 0) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ ...eyebrow, fontSize: 12, color: highlight }}>Visit</p>
                {footer.address && <p style={{ margin: 0, color: "#E8DDD2" }}>{footer.address}</p>}
                {footer.hours.map((h) => <p key={h} style={{ margin: 0, color: "#E8DDD2" }}>{h}</p>)}
              </div>
            )}
            {(footer.phone || footer.email) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ ...eyebrow, fontSize: 12, color: highlight }}>Contact</p>
                {footer.phone && <p style={{ margin: 0, color: "#E8DDD2" }}>{footer.phone}</p>}
                {footer.email && <p style={{ margin: 0, color: "#E8DDD2", overflowWrap: "anywhere" }}>{footer.email}</p>}
              </div>
            )}
            {(footer.instagramUrl || footer.facebookUrl) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ ...eyebrow, fontSize: 12, color: highlight }}>Follow</p>
                {footer.instagramUrl && <a href={footer.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#E8DDD2" }}>Instagram</a>}
                {footer.facebookUrl && <a href={footer.facebookUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#E8DDD2" }}>Facebook</a>}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
