"use client";

// ─── Platform marketing landing page (apex domain) ──────────────────────────
//
// Editorial / premium redesign. Warm paper palette, Fraunces serif display,
// rich scroll-driven motion (line reveals, count-up stats, scroll reveals,
// hero parallax, operator-type marquee). Self-contained: no external motion
// library — motion runs off IntersectionObserver + requestAnimationFrame in
// a single useEffect. All CSS is scoped under the `.lp` root class so the
// page's resets never leak into the admin / customer apps.
//
// The previous version is archived at _archive/landing-page-v10.tsx.bak.

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

// ─── Small presentational helpers ───────────────────────────────────────────

function delay(d: string): React.CSSProperties {
  return { ["--d" as string]: d } as React.CSSProperties;
}

function Bowl() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#F6F1E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20" /><path d="M3 12a9 9 0 0 0 18 0" /><path d="M12 7v-2" /><path d="M9 5h6" />
    </svg>
  );
}

function Check({ color = "#2C4031", size = 15, sw = 3 }: { color?: string; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Star({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#C99A3F" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
    </svg>
  );
}

function Stars({ size = 13 }: { size?: number }) {
  return (
    <span className="stars">
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} />)}
    </span>
  );
}

// ─── Content ─────────────────────────────────────────────────────────────────

const OPERATOR_TYPES = [
  "School districts", "Corporate catering", "Office lunch",
  "Daycares & preschools", "Summer camps", "Senior living", "Co-working spaces",
];

const STATS = [
  { count: 10000, suffix: "+", cap: "Orders processed" },
  { count: 200, suffix: "+", cap: "Locations served" },
  { count: 50, suffix: "+", cap: "Restaurants & caterers" },
];

const ORDER_ROWS = [
  { initial: "E", color: "#2C4031", name: "Emma T.", detail: "Smash Burger + Fries · Lincoln Elementary", price: "$14.50", status: "PAID" },
  { initial: "L", color: "#C0673E", name: "Liam K.", detail: "Crispy Chicken Sandwich · Northgate Office", price: "$12.00", status: "PAID" },
  { initial: "S", color: "#C99A3F", name: "Sophia R.", detail: "Garden Salad + Lemonade · Lincoln Elementary", price: "$10.75", status: "REFUNDED" },
];

const FEATURES = [
  { n: "01", t: "Smart menu builder", d: "Build your full menu with photos, prices, add-ons, and removals. Go live in minutes." },
  { n: "02", t: "Cutoffs & automated emails", d: "Set ordering deadlines per delivery date. Confirmations, reminders, and receipts go out on their own." },
  { n: "03", t: "Stripe payments", d: "Every order paid up front. Funds land straight in your connected account — no chasing money." },
  { n: "04", t: "Multi-location support", d: "Serve any number of locations from one dashboard, each with its own delivery schedule." },
  { n: "05", t: "Live order dashboard", d: "See every order in real time. Export kitchen sheets, track payments, manage refunds." },
  { n: "06", t: "Auto label printing", d: "Print a kitchen label for every order — name, allergens, add-ons. No manual sorting." },
  { n: "07", t: "Discount module", d: "Create promo codes — percentage or flat, with usage limits — applied automatically at checkout." },
  { n: "08", t: "Multi-day checkout", d: "Customers order across several delivery dates in one checkout — fewer drop-offs, more committed orders." },
];

const STEPS = [
  {
    n: "Step 01", t: "Build your menu",
    d: "Add your dishes with photos and prices, set the add-ons, and you have a menu customers can order from.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D98C5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    n: "Step 02", t: "Set your schedule",
    d: "Pick your delivery dates and ordering cutoffs for each location. LunchPad handles the reminders.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D98C5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    n: "Step 03", t: "Share your link & get paid",
    d: "Send customers your ordering page. Orders and payments flow straight to your dashboard.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D98C5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    ),
  },
];

const PRICING = [
  {
    name: "Starter", price: "49", pop: false,
    desc: "Perfect for single-location operations just getting started.",
    feats: ["Up to 2 locations", "Unlimited menu items", "Stripe payouts", "Email confirmations", "Order dashboard"],
  },
  {
    name: "Growth", price: "149", pop: true,
    desc: "For growing operators serving multiple locations.",
    feats: ["Up to 10 locations", "Weekly batch checkout", "Cutoff reminders", "Priority support", "Everything in Starter"],
  },
  {
    name: "Scale", price: "349", pop: false,
    desc: "Enterprise-grade for large districts and multi-brand operators.",
    feats: ["Unlimited locations", "Custom branding", "Dedicated onboarding", "SLA support", "Everything in Growth"],
  },
];

const TESTIMONIALS = [
  { initials: "MK", color: "#C0673E", quote: "The cutoff feature saved us from hundreds of last-minute headaches. Setup took under an hour.", name: "Marcus K.", role: "Corporate catering operator" },
  { initials: "TL", color: "#3C5343", quote: "Software that actually understands a lunch program — not some generic food ordering app.", name: "Tanya L.", role: "District food services" },
];

const HERO_TRUST = ["No credit card needed", "Set up in a day", "No per-order fees, ever"];

// ─── Scoped stylesheet ───────────────────────────────────────────────────────

const CSS = `
.lp{
  --paper:#F6F1E6; --paper-2:#EFE8D7; --card:#FFFFFF; --card-warm:#FCFAF3;
  --ink:#211D15; --ink-soft:#5B5446; --ink-faint:#938B78;
  --green:#2C4031; --green-deep:#1E2C22; --green-soft:#3C5343;
  --clay:#C0673E; --clay-soft:#D98C5F; --line:#E3DBC6; --line-soft:#EDE6D4;
  --sage:#DEE2CF; --gold:#C99A3F;
  --shadow-lg:0 30px 70px -28px rgba(33,29,21,0.40);
  --shadow-md:0 18px 44px -22px rgba(33,29,21,0.34);
  --shadow-sm:0 8px 22px -14px rgba(33,29,21,0.30);
  --serif:"Fraunces",Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --ease:cubic-bezier(.22,.61,.36,1);
  font-family:var(--sans); background:var(--paper); color:var(--ink);
  -webkit-font-smoothing:antialiased; overflow-x:hidden; position:relative;
}
.lp *{margin:0;padding:0;box-sizing:border-box;}
.lp a{color:inherit;text-decoration:none;}
.lp ::selection{background:var(--green);color:var(--paper);}
.lp::before{
  content:"";position:fixed;inset:0;z-index:1;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity:0.035;mix-blend-mode:multiply;
}

.lp .reveal{opacity:0;transform:translateY(34px);transition:opacity 1s var(--ease),transform 1s var(--ease);transition-delay:var(--d,0s);}
.lp .reveal.in{opacity:1;transform:translateY(0);}
.lp .reveal-l{opacity:0;transform:translateX(-40px);transition:opacity 1s var(--ease),transform 1s var(--ease);transition-delay:var(--d,0s);}
.lp .reveal-l.in{opacity:1;transform:translateX(0);}
.lp .reveal-r{opacity:0;transform:translateX(40px);transition:opacity 1s var(--ease),transform 1s var(--ease);transition-delay:var(--d,0s);}
.lp .reveal-r.in{opacity:1;transform:translateX(0);}
@media (prefers-reduced-motion:reduce){
  .lp .reveal,.lp .reveal-l,.lp .reveal-r{opacity:1!important;transform:none!important;}
  .lp .hero-title .line span{transform:none!important;}
  .lp .marquee-track{animation:none!important;}
}

.lp .nav{
  position:fixed;top:0;left:0;right:0;z-index:50;
  display:flex;align-items:center;justify-content:space-between;
  padding:22px 48px;transition:padding .4s var(--ease),background .4s var(--ease),box-shadow .4s var(--ease),border-color .4s var(--ease);
  border-bottom:1px solid transparent;
}
.lp .nav.scrolled{
  padding:14px 48px;background:rgba(246,241,230,0.88);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--line);box-shadow:0 6px 24px -20px rgba(33,29,21,0.5);
}
.lp .brand{display:flex;align-items:center;gap:11px;font-family:var(--serif);font-weight:600;font-size:23px;letter-spacing:-.01em;color:var(--ink);}
.lp .brand-mark{width:38px;height:38px;border-radius:11px;background:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.12);}
.lp .nav-links{display:flex;gap:34px;font-size:14.5px;font-weight:400;color:var(--ink-soft);}
.lp .nav-links a{position:relative;padding:4px 0;transition:color .25s;}
.lp .nav-links a::after{content:"";position:absolute;left:0;bottom:0;width:0;height:1.5px;background:var(--clay);transition:width .3s var(--ease);}
.lp .nav-links a:hover{color:var(--ink);}
.lp .nav-links a:hover::after{width:100%;}
.lp .nav-cta{display:flex;align-items:center;gap:14px;}
.lp .link-quiet{font-size:14.5px;font-weight:500;color:var(--ink-soft);transition:color .25s;}
.lp .link-quiet:hover{color:var(--ink);}

.lp .btn{display:inline-flex;align-items:center;gap:9px;font-family:var(--sans);font-weight:600;font-size:14.5px;border-radius:100px;cursor:pointer;transition:transform .3s var(--ease),box-shadow .3s var(--ease),background .3s;border:none;white-space:nowrap;}
.lp .btn-primary{background:var(--green);color:var(--paper);padding:13px 26px;box-shadow:0 12px 26px -14px rgba(44,64,49,0.85);}
.lp .btn-primary:hover{transform:translateY(-3px);box-shadow:0 18px 34px -14px rgba(44,64,49,0.9);}
.lp .btn-ghost{background:transparent;color:var(--ink);padding:13px 24px;border:1.4px solid var(--ink);}
.lp .btn-ghost:hover{transform:translateY(-3px);background:var(--ink);color:var(--paper);}
.lp .btn-lg{font-size:16px;padding:17px 34px;}

.lp .hero{position:relative;z-index:2;padding:170px 48px 90px;max-width:1320px;margin:0 auto;display:grid;grid-template-columns:1.06fr 0.94fr;gap:54px;align-items:center;}
.lp .hero-glow{position:absolute;z-index:-1;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(192,103,62,0.16),transparent 66%);top:-60px;right:-120px;filter:blur(10px);}
.lp .hero-glow.two{background:radial-gradient(circle,rgba(44,64,49,0.14),transparent 66%);top:340px;left:-220px;width:520px;height:520px;}
.lp .eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--green);background:rgba(44,64,49,0.07);border:1px solid rgba(44,64,49,0.16);padding:8px 15px;border-radius:100px;margin-bottom:26px;}
.lp .eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--clay);animation:lp-breathe 3.4s ease-in-out infinite;}
@keyframes lp-breathe{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.7);opacity:.4;}}

.lp .hero-title{font-family:var(--serif);font-weight:500;font-size:clamp(46px,5.6vw,80px);line-height:1.02;letter-spacing:-.022em;color:var(--ink);margin-bottom:26px;}
.lp .hero-title em{font-style:italic;font-weight:500;color:var(--green);}
.lp .hero-title .line{display:block;overflow:hidden;padding-bottom:0.16em;}
.lp .hero-title .line:not(:last-child){margin-bottom:-0.16em;}
.lp .hero-title .line span{display:block;transform:translateY(130%);transition:transform 1.05s var(--ease);transition-delay:var(--d,0s);}
.lp .hero-title.in .line span{transform:translateY(0);}
.lp .hero-sub{font-size:18.5px;line-height:1.65;color:var(--ink-soft);max-width:482px;margin-bottom:34px;font-weight:400;}
.lp .hero-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:30px;}
.lp .hero-trust{display:flex;gap:22px;flex-wrap:wrap;}
.lp .hero-trust .t{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink-faint);font-weight:500;}
.lp .hero-proof{display:flex;align-items:center;gap:13px;margin-top:34px;padding-top:26px;border-top:1px solid var(--line);}
.lp .avatars{display:flex;}
.lp .avatars .av{width:38px;height:38px;border-radius:50%;border:2.5px solid var(--paper);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;margin-left:-11px;box-shadow:var(--shadow-sm);}
.lp .avatars .av:first-child{margin-left:0;}
.lp .hero-proof p{font-size:14px;color:var(--ink-soft);line-height:1.5;}
.lp .hero-proof strong{color:var(--ink);font-weight:700;}
.lp .stars{display:inline-flex;gap:1px;vertical-align:-1px;}

.lp .hero-visual{position:relative;height:560px;}
.lp .float{will-change:transform;}
.lp .dash{position:absolute;top:40px;left:6%;width:90%;background:var(--card);border-radius:20px;border:1px solid var(--line);box-shadow:var(--shadow-lg);overflow:hidden;}
.lp .dash-bar{display:flex;align-items:center;gap:7px;padding:13px 16px;border-bottom:1px solid var(--line-soft);background:var(--card-warm);}
.lp .dash-bar .d{width:10px;height:10px;border-radius:50%;}
.lp .dash-url{flex:1;margin-left:8px;font-size:11px;color:var(--ink-faint);background:var(--paper);border:1px solid var(--line-soft);border-radius:6px;padding:5px 11px;}
.lp .dash-body{padding:20px;}
.lp .dash-h{font-family:var(--serif);font-size:18px;font-weight:600;margin-bottom:3px;}
.lp .dash-sub{font-size:12px;color:var(--ink-faint);margin-bottom:16px;}
.lp .dash-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
.lp .tile{background:var(--card-warm);border:1px solid var(--line-soft);border-radius:12px;padding:13px 14px;}
.lp .tile .lbl{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:6px;}
.lp .tile .val{font-family:var(--serif);font-size:25px;font-weight:600;line-height:1;color:var(--ink);}
.lp .tile .delta{font-size:10.5px;color:var(--green);margin-top:5px;font-weight:600;}
.lp .tile.wide{grid-column:1/-1;background:var(--green);border-color:var(--green);}
.lp .tile.wide .lbl{color:rgba(246,241,230,0.6);}
.lp .tile.wide .val{color:var(--paper);}
.lp .tile.wide .delta{color:var(--clay-soft);}
.lp .dash-list-h{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:9px;}
.lp .order-row{display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid var(--line-soft);}
.lp .order-row:first-of-type{border-top:none;}
.lp .o-av{width:30px;height:30px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;}
.lp .o-name{font-size:12.5px;font-weight:600;color:var(--ink);}
.lp .o-detail{font-size:10.5px;color:var(--ink-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;}
.lp .o-price{font-family:var(--serif);font-size:13px;font-weight:600;}
.lp .pill{display:inline-block;padding:2px 9px;border-radius:100px;font-size:9px;font-weight:700;letter-spacing:.04em;margin-top:3px;}
.lp .pill.paid{background:var(--sage);color:var(--green);}
.lp .pill.refund{background:#F1DAD0;color:var(--clay);}
.lp .chip{position:absolute;background:var(--card);border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow-md);padding:14px 17px;display:flex;align-items:center;gap:12px;}
.lp .chip-tick{top:6px;right:-12px;}
.lp .chip-cal{bottom:18px;left:-26px;}
.lp .chip-ic{width:42px;height:42px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.lp .chip-t{font-size:13px;font-weight:700;color:var(--ink);}
.lp .chip-s{font-size:11px;color:var(--ink-faint);margin-top:2px;}
.lp .medallion{position:absolute;bottom:-20px;right:2%;width:128px;height:128px;border-radius:50%;border:6px solid var(--paper);background:var(--green);box-shadow:var(--shadow-md);overflow:hidden;}

.lp .marquee{position:relative;z-index:2;padding:30px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--paper-2);overflow:hidden;}
.lp .marquee::before,.lp .marquee::after{content:"";position:absolute;top:0;bottom:0;width:160px;z-index:3;}
.lp .marquee::before{left:0;background:linear-gradient(to right,var(--paper-2),transparent);}
.lp .marquee::after{right:0;background:linear-gradient(to left,var(--paper-2),transparent);}
.lp .marquee-label{text-align:center;font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:20px;}
.lp .marquee-track{display:flex;width:max-content;animation:lp-slide 38s linear infinite;}
.lp .marquee:hover .marquee-track{animation-play-state:paused;}
@keyframes lp-slide{to{transform:translateX(-50%);}}
.lp .m-item{display:flex;align-items:center;gap:42px;padding:0 42px;font-family:var(--serif);font-size:25px;font-weight:500;color:var(--ink);white-space:nowrap;}
.lp .m-item .sep{width:7px;height:7px;border-radius:50%;background:var(--clay);flex-shrink:0;}

.lp .section{position:relative;z-index:2;max-width:1180px;margin:0 auto;padding:108px 48px;}
.lp .kicker{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--clay);margin-bottom:18px;}
.lp .kicker::before{content:"";width:26px;height:1.5px;background:var(--clay);}
.lp .section-title{font-family:var(--serif);font-weight:500;font-size:clamp(34px,3.9vw,52px);line-height:1.08;letter-spacing:-.02em;color:var(--ink);max-width:680px;}
.lp .section-title em{font-style:italic;color:var(--green);}
.lp .section-lead{font-size:17.5px;line-height:1.65;color:var(--ink-soft);max-width:560px;margin-top:20px;font-weight:400;}

.lp .stats{position:relative;z-index:2;background:var(--green);color:var(--paper);}
.lp .stats-inner{max-width:1180px;margin:0 auto;padding:74px 48px;display:grid;grid-template-columns:repeat(3,1fr);gap:30px;}
.lp .stat{text-align:center;position:relative;}
.lp .stat:not(:last-child)::after{content:"";position:absolute;right:-15px;top:14%;bottom:14%;width:1px;background:rgba(246,241,230,0.18);}
.lp .stat .num{font-family:var(--serif);font-weight:500;font-size:clamp(46px,5vw,68px);line-height:1;letter-spacing:-.02em;}
.lp .stat .cap{font-size:14.5px;color:rgba(246,241,230,0.66);margin-top:12px;letter-spacing:.02em;}

.lp .story{background:var(--paper-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);position:relative;z-index:2;}
.lp .story-inner{max-width:1180px;margin:0 auto;padding:108px 48px;display:grid;grid-template-columns:0.82fr 1.18fr;gap:64px;align-items:center;}
.lp .story-portrait{position:relative;aspect-ratio:4/5;border-radius:18px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow-md);background:var(--green);}
.lp .story-portrait .badge{position:absolute;left:18px;bottom:18px;right:18px;z-index:2;background:rgba(246,241,230,0.94);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-radius:13px;padding:14px 16px;}
.lp .story-portrait .badge .nm{font-family:var(--serif);font-size:16px;font-weight:600;}
.lp .story-portrait .badge .rl{font-size:12px;color:var(--ink-soft);margin-top:2px;}
.lp .story-quote{font-family:var(--serif);font-weight:400;font-style:italic;font-size:clamp(26px,2.7vw,36px);line-height:1.34;letter-spacing:-.01em;color:var(--ink);margin:24px 0 26px;}
.lp .story-quote .hl{font-style:normal;color:var(--green);background:linear-gradient(transparent 62%,rgba(192,103,62,0.22) 62%);}
.lp .story-body{font-size:16.5px;line-height:1.7;color:var(--ink-soft);max-width:520px;}
.lp .story-sig{margin-top:24px;display:flex;align-items:center;gap:13px;flex-wrap:wrap;}
.lp .story-sig .sg{font-family:var(--serif);font-style:italic;font-size:22px;color:var(--green);}
.lp .story-sig .who{font-size:13px;color:var(--ink-faint);}

.lp .feat-grid{display:grid;grid-template-columns:repeat(2,1fr);margin-top:56px;border-top:1px solid var(--line);}
.lp .feat{padding:34px 42px 34px 0;border-bottom:1px solid var(--line);display:flex;gap:24px;position:relative;}
.lp .feat:nth-child(even){padding-left:42px;padding-right:0;border-left:1px solid var(--line);}
.lp .feat::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--clay);transform:scaleX(0);transform-origin:left;transition:transform .45s var(--ease);}
.lp .feat:hover::after{transform:scaleX(1);}
.lp .feat-num{font-family:var(--serif);font-size:30px;font-weight:500;color:var(--clay);line-height:1;flex-shrink:0;width:48px;}
.lp .feat-t{font-family:var(--serif);font-size:21px;font-weight:600;color:var(--ink);margin-bottom:8px;letter-spacing:-.01em;}
.lp .feat-d{font-size:14.5px;line-height:1.62;color:var(--ink-soft);}

.lp .how{background:var(--green-deep);color:var(--paper);position:relative;z-index:2;}
.lp .how-inner{max-width:1180px;margin:0 auto;padding:108px 48px;}
.lp .how .kicker{color:var(--clay-soft);}
.lp .how .kicker::before{background:var(--clay-soft);}
.lp .how .section-title{color:var(--paper);}
.lp .how .section-title em{color:var(--clay-soft);}
.lp .how-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:34px;margin-top:60px;}
.lp .step{position:relative;padding-top:34px;border-top:2px solid rgba(246,241,230,0.18);}
.lp .step-ic{width:50px;height:50px;border-radius:14px;background:rgba(246,241,230,0.07);border:1px solid rgba(246,241,230,0.14);display:flex;align-items:center;justify-content:center;margin-bottom:22px;}
.lp .step-n{font-family:var(--serif);font-size:15px;font-weight:600;color:var(--clay-soft);letter-spacing:.05em;margin-bottom:18px;}
.lp .step-t{font-family:var(--serif);font-size:24px;font-weight:600;color:var(--paper);margin-bottom:11px;letter-spacing:-.01em;}
.lp .step-d{font-size:15px;line-height:1.66;color:rgba(246,241,230,0.66);}

.lp .testi{position:relative;z-index:2;}
.lp .testi-feature{margin-top:50px;background:var(--green);border-radius:22px;padding:56px 60px;position:relative;overflow:hidden;color:var(--paper);}
.lp .testi-feature .mark{position:absolute;top:-30px;right:30px;font-family:var(--serif);font-size:240px;line-height:1;color:rgba(246,241,230,0.07);font-style:italic;}
.lp .testi-feature .quote{font-family:var(--serif);font-weight:400;font-size:clamp(24px,2.6vw,33px);line-height:1.4;letter-spacing:-.01em;max-width:760px;position:relative;}
.lp .testi-feature .who-row{display:flex;align-items:center;gap:14px;margin-top:32px;position:relative;}
.lp .testi-feature .who-av{width:50px;height:50px;border-radius:13px;background:var(--clay);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;}
.lp .testi-feature .who-n{font-family:var(--serif);font-size:17px;font-weight:600;}
.lp .testi-feature .who-r{font-size:13px;color:rgba(246,241,230,0.6);margin-top:2px;}
.lp .testi-row{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:22px;}
.lp .testi-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:32px 34px;transition:transform .4s var(--ease),box-shadow .4s var(--ease);}
.lp .testi-card:hover{transform:translateY(-6px);box-shadow:var(--shadow-md);}
.lp .testi-card .stars{margin-bottom:16px;}
.lp .testi-card .q{font-family:var(--serif);font-size:18.5px;line-height:1.5;color:var(--ink);margin-bottom:20px;font-weight:500;letter-spacing:-.005em;}
.lp .testi-card .who-row{display:flex;align-items:center;gap:12px;}
.lp .testi-card .who-av{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;}
.lp .testi-card .who-n{font-size:14px;font-weight:700;color:var(--ink);}
.lp .testi-card .who-r{font-size:12.5px;color:var(--ink-faint);margin-top:1px;}

.lp .pricing{background:var(--paper-2);border-top:1px solid var(--line);position:relative;z-index:2;}
.lp .pricing-inner{max-width:1180px;margin:0 auto;padding:108px 48px;}
.lp .price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:56px;align-items:start;}
.lp .price-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:34px 32px;display:flex;flex-direction:column;position:relative;transition:transform .4s var(--ease),box-shadow .4s var(--ease);}
.lp .price-card:hover{transform:translateY(-7px);box-shadow:var(--shadow-md);}
.lp .price-card.pop{background:var(--green);border-color:var(--green);color:var(--paper);box-shadow:var(--shadow-lg);transform:scale(1.035);}
.lp .price-card.pop:hover{transform:scale(1.035) translateY(-7px);}
.lp .pop-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:var(--clay);color:#fff;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:6px 17px;border-radius:100px;white-space:nowrap;box-shadow:var(--shadow-sm);}
.lp .price-name{font-family:var(--serif);font-size:21px;font-weight:600;margin-bottom:6px;}
.lp .price-card.pop .price-name{color:var(--paper);}
.lp .price-amt{font-family:var(--serif);font-weight:500;line-height:1;margin:14px 0 4px;letter-spacing:-.02em;}
.lp .price-amt .cur{font-size:24px;vertical-align:18px;font-weight:500;}
.lp .price-amt .big{font-size:62px;}
.lp .price-amt .per{font-size:16px;color:var(--ink-faint);font-family:var(--sans);font-weight:500;}
.lp .price-card.pop .price-amt .per{color:rgba(246,241,230,0.6);}
.lp .price-desc{font-size:14px;line-height:1.55;color:var(--ink-soft);padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid var(--line);}
.lp .price-card.pop .price-desc{color:rgba(246,241,230,0.7);border-color:rgba(246,241,230,0.16);}
.lp .price-feats{display:flex;flex-direction:column;gap:13px;flex:1;margin-bottom:28px;}
.lp .pf{display:flex;align-items:flex-start;gap:10px;font-size:14px;color:var(--ink-soft);}
.lp .price-card.pop .pf{color:rgba(246,241,230,0.86);}
.lp .pf svg{flex-shrink:0;margin-top:2px;}
.lp .price-btn{text-align:center;font-weight:600;font-size:14.5px;padding:13px 0;border-radius:100px;transition:transform .3s var(--ease),box-shadow .3s;}
.lp .price-btn.solid{background:var(--green);color:var(--paper);}
.lp .price-btn.solid:hover{transform:translateY(-3px);box-shadow:0 14px 26px -14px rgba(44,64,49,0.8);}
.lp .price-btn.on-green{background:var(--clay);color:#fff;}
.lp .price-btn.on-green:hover{transform:translateY(-3px);box-shadow:0 14px 26px -14px rgba(192,103,62,0.85);}
.lp .price-foot{text-align:center;font-size:14px;color:var(--ink-faint);margin-top:34px;}

.lp .final{position:relative;z-index:2;max-width:1180px;margin:0 auto;padding:112px 48px;}
.lp .final-box{background:var(--green);border-radius:26px;padding:74px 64px;position:relative;overflow:hidden;text-align:center;}
.lp .final-box .glow{position:absolute;width:440px;height:440px;border-radius:50%;}
.lp .final-box .glow.a{top:-200px;left:-120px;background:radial-gradient(circle,rgba(192,103,62,0.4),transparent 68%);}
.lp .final-box .glow.b{bottom:-220px;right:-100px;background:radial-gradient(circle,rgba(222,226,207,0.22),transparent 68%);}
.lp .final-eyebrow{font-size:12.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--clay-soft);margin-bottom:20px;position:relative;}
.lp .final-box h2{font-family:var(--serif);font-weight:500;font-size:clamp(34px,4vw,54px);line-height:1.08;letter-spacing:-.02em;color:var(--paper);max-width:680px;margin:0 auto 20px;position:relative;}
.lp .final-box h2 em{font-style:italic;color:var(--clay-soft);}
.lp .final-box p{font-size:17px;color:rgba(246,241,230,0.72);max-width:480px;margin:0 auto 34px;line-height:1.6;position:relative;}
.lp .final-actions{display:flex;gap:15px;justify-content:center;flex-wrap:wrap;position:relative;}
.lp .btn-cream{background:var(--paper);color:var(--green);}
.lp .btn-cream:hover{transform:translateY(-3px);box-shadow:0 18px 34px -14px rgba(0,0,0,0.5);}
.lp .btn-outline-cream{background:transparent;color:var(--paper);border:1.4px solid rgba(246,241,230,0.4);}
.lp .btn-outline-cream:hover{transform:translateY(-3px);background:rgba(246,241,230,0.1);}

.lp .footer{background:var(--green-deep);color:var(--paper);position:relative;z-index:2;}
.lp .footer-inner{max-width:1180px;margin:0 auto;padding:64px 48px 30px;}
.lp .footer-top{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:40px;padding-bottom:44px;border-bottom:1px solid rgba(246,241,230,0.12);}
.lp .footer-brand .brand{color:var(--paper);margin-bottom:14px;}
.lp .footer-brand p{font-size:14px;line-height:1.6;color:rgba(246,241,230,0.55);max-width:280px;}
.lp .footer-col h4{font-size:12.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(246,241,230,0.45);margin-bottom:16px;}
.lp .footer-col a{display:block;font-size:14.5px;color:rgba(246,241,230,0.78);margin-bottom:11px;transition:color .25s;}
.lp .footer-col a:hover{color:var(--clay-soft);}
.lp .footer-bot{display:flex;justify-content:space-between;align-items:center;padding-top:26px;flex-wrap:wrap;gap:12px;}
.lp .footer-bot span{font-size:13px;color:rgba(246,241,230,0.45);}
.lp .footer-bot .links{display:flex;gap:22px;}
.lp .footer-bot .links a{font-size:13px;color:rgba(246,241,230,0.6);}
.lp .footer-bot .links a:hover{color:var(--clay-soft);}

@media (max-width:1000px){
  .lp .hero{grid-template-columns:1fr;gap:40px;padding-top:140px;}
  .lp .hero-visual{height:480px;max-width:520px;}
  .lp .story-inner{grid-template-columns:1fr;gap:40px;}
  .lp .story-portrait{max-width:380px;}
  .lp .testi-row,.lp .testi-feature{grid-template-columns:1fr;}
  .lp .price-card.pop{transform:none;}
  .lp .price-card.pop:hover{transform:translateY(-7px);}
  .lp .footer-top{grid-template-columns:1fr 1fr;}
}
@media (max-width:760px){
  .lp .nav,.lp .nav.scrolled{padding:14px 22px;}
  .lp .nav-links{display:none;}
  .lp .hero{padding:120px 22px 70px;}
  .lp .hero-actions{justify-content:center;}
  .lp .section,.lp .story-inner,.lp .how-inner,.lp .pricing-inner,.lp .stats-inner,.lp .final{padding-left:22px;padding-right:22px;}
  .lp .feat-grid{grid-template-columns:1fr;}
  .lp .feat:nth-child(even){padding-left:0;border-left:none;}
  .lp .feat{padding-right:0;}
  .lp .stats-inner{grid-template-columns:1fr;gap:0;}
  .lp .stat:not(:last-child)::after{display:none;}
  .lp .stat{padding:30px 0;border-bottom:1px solid rgba(246,241,230,0.16);}
  .lp .how-steps{grid-template-columns:1fr;gap:20px;}
  .lp .price-grid{grid-template-columns:1fr;}
  .lp .testi-feature{padding:40px 30px;}
  .lp .final-box{padding:54px 28px;}
  .lp .footer-top{grid-template-columns:1fr;gap:30px;}
  .lp .hero-visual{height:430px;}
  .lp .medallion{width:96px;height:96px;}
}
`;

// ─── Component ───────────────────────────────────────────────────────────────

export function PlatformLanding() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Nav scroll state
    const nav = root.querySelector(".nav");
    const onNavScroll = () => {
      if (nav) nav.classList.toggle("scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onNavScroll, { passive: true });
    onNavScroll();

    // Hero title line reveal
    const heroTitle = root.querySelector(".hero-title");
    const titleTimer = window.setTimeout(() => heroTitle?.classList.add("in"), 220);

    // Scroll reveal
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -40px 0px" }
    );
    root.querySelectorAll(".reveal,.reveal-l,.reveal-r").forEach((el) => io.observe(el));

    // Animated counters
    const countUp = (el: HTMLElement) => {
      const target = parseFloat(el.dataset.count || "0");
      const suffix = el.dataset.suffix || "";
      const dur = 1700;
      let start: number | null = null;
      const step = (ts: number) => {
        if (start === null) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            countUp(e.target as HTMLElement);
            co.unobserve(e.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => co.observe(el));

    // Hero parallax (mouse + scroll)
    const heroVisual = root.querySelector(".hero-visual");
    const floats = heroVisual
      ? Array.from(heroVisual.querySelectorAll<HTMLElement>(".float"))
      : [];
    let mx = 0;
    let my = 0;
    let sy = 0;
    const applyParallax = () => {
      floats.forEach((f) => {
        const depth = parseFloat(f.dataset.depth || "10");
        const k = depth / 40;
        f.style.transform =
          "translate3d(" + mx * k + "px," + (my * k + sy * k * 0.6) + "px,0)";
      });
    };
    const onMouse = (ev: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      mx = ((ev.clientX - cx) / cx) * -14;
      my = ((ev.clientY - cy) / cy) * -14;
      applyParallax();
    };
    const onParallaxScroll = () => {
      if (!heroVisual) return;
      const r = heroVisual.getBoundingClientRect();
      sy = (window.innerHeight / 2 - (r.top + r.height / 2)) * 0.06;
      applyParallax();
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("scroll", onParallaxScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onNavScroll);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("scroll", onParallaxScroll);
      window.clearTimeout(titleTimer);
      io.disconnect();
      co.disconnect();
    };
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="nav">
        <Link href="/" className="brand">
          <span className="brand-mark"><Bowl /></span>
          LunchPad
        </Link>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#testimonials">Stories</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="nav-cta">
          <Link href="/admin/login" className="link-quiet">Sign in</Link>
          <Link href="/signup" className="btn btn-primary">Start free trial</Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-glow two" />

        <div className="hero-copy">
          <span className="eyebrow reveal"><span className="dot" />Built by a lunch operator</span>
          <h1 className="hero-title">
            <span className="line"><span style={delay(".05s")}>Lunch,</span></span>
            <span className="line"><span style={delay(".16s")}><em>finally</em> handled.</span></span>
          </h1>
          <p className="hero-sub reveal" style={delay(".3s")}>
            LunchPad runs the ordering, payments, and pickup lists for your lunch
            program — schools, offices, anywhere you deliver. You focus on the food.
          </p>
          <div className="hero-actions reveal" style={delay(".4s")}>
            <Link href="/signup" className="btn btn-primary btn-lg">Start free — 14 days</Link>
            <a href="#how" className="btn btn-ghost btn-lg">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              See how it works
            </a>
          </div>
          <div className="hero-trust reveal" style={delay(".5s")}>
            {HERO_TRUST.map((t) => (
              <div className="t" key={t}><Check /> {t}</div>
            ))}
          </div>
          <div className="hero-proof reveal" style={delay(".6s")}>
            <div className="avatars">
              <div className="av" style={{ background: "#2C4031" }}>SR</div>
              <div className="av" style={{ background: "#C0673E" }}>MK</div>
              <div className="av" style={{ background: "#3C5343" }}>TL</div>
              <div className="av" style={{ background: "#C99A3F" }}>JA</div>
            </div>
            <p>
              <Stars /><br />
              <strong>200+ operators</strong> trust LunchPad to run their lunch program.
            </p>
          </div>
        </div>

        <div className="hero-visual">
          <div className="float dash" data-depth="14">
            <div className="dash-bar">
              <span className="d" style={{ background: "#E24B4A" }} />
              <span className="d" style={{ background: "#EF9F27" }} />
              <span className="d" style={{ background: "#2C4031" }} />
              <span className="dash-url">app.lunchpad.us/admin/orders</span>
            </div>
            <div className="dash-body">
              <div className="dash-h">Today&apos;s Orders</div>
              <div className="dash-sub">Thursday — ordering closes 9:00 PM</div>
              <div className="dash-tiles">
                <div className="tile">
                  <div className="lbl">Orders</div>
                  <div className="val">47</div>
                  <div className="delta">▲ 12 vs last week</div>
                </div>
                <div className="tile">
                  <div className="lbl">Revenue</div>
                  <div className="val">$681</div>
                  <div className="delta">3 locations active</div>
                </div>
                <div className="tile wide">
                  <div className="lbl">Pending cutoff</div>
                  <div className="val">9h 22m</div>
                  <div className="delta">Closes tonight</div>
                </div>
              </div>
              <div className="dash-list-h">Recent orders</div>
              {ORDER_ROWS.map((row) => (
                <div className="order-row" key={row.name}>
                  <div className="o-av" style={{ background: row.color }}>{row.initial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="o-name">{row.name}</div>
                    <div className="o-detail">{row.detail}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="o-price">{row.price}</div>
                    <span className={"pill " + (row.status === "PAID" ? "paid" : "refund")}>
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="float chip chip-tick" data-depth="30">
            <div className="chip-ic" style={{ background: "#DEE2CF" }}>
              <Check color="#2C4031" size={20} sw={2.6} />
            </div>
            <div>
              <div className="chip-t">Payment received</div>
              <div className="chip-s">Straight to your account</div>
            </div>
          </div>

          <div className="float chip chip-cal" data-depth="22">
            <div className="chip-ic" style={{ background: "#F1DAD0" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C0673E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <div>
              <div className="chip-t">Friday menu live</div>
              <div className="chip-s">Reminders sent automatically</div>
            </div>
          </div>

          <div className="float medallion" data-depth="40">
            <Image src="/food/burger-cheesy.webp" alt="" fill sizes="128px" style={{ objectFit: "cover" }} />
          </div>
        </div>
      </section>

      {/* ── Marquee ─────────────────────────────────────────────────── */}
      <div className="marquee">
        <div className="marquee-label">One platform for every kind of lunch program</div>
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <div className="m-item" key={copy} aria-hidden={copy === 1 ? "true" : undefined}>
              {OPERATOR_TYPES.map((o) => (
                <span key={o} style={{ display: "flex", alignItems: "center", gap: 42 }}>
                  {o}<span className="sep" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────── */}
      <div className="stats">
        <div className="stats-inner">
          {STATS.map((s, i) => (
            <div className="stat reveal" key={s.cap} style={delay(i * 0.12 + "s")}>
              <div className="num">
                <span data-count={s.count} data-suffix={s.suffix}>0</span>
              </div>
              <div className="cap">{s.cap}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Operator story ──────────────────────────────────────────── */}
      <div className="story">
        <div className="story-inner">
          <div className="story-portrait reveal-l">
            <Image
              src="/food/hero.jpeg"
              alt="Freshly prepared lunch from a LunchPad operator"
              fill
              sizes="(max-width:1000px) 380px, 33vw"
              style={{ objectFit: "cover" }}
            />
            <div className="badge">
              <div className="nm">A real lunch counter</div>
              <div className="rl">Where LunchPad started</div>
            </div>
          </div>
          <div className="story-text">
            <span className="kicker reveal">Why we built this</span>
            <h2 className="section-title reveal" style={delay(".08s")}>
              We&apos;ve run a lunch program. We know the <em>Friday-night spreadsheet.</em>
            </h2>
            <p className="story-quote reveal" style={delay(".16s")}>
              &ldquo;We built the tool we <span className="hl">wished we had</span> — every
              feature here started as a real headache we wanted gone.&rdquo;
            </p>
            <p className="story-body reveal" style={delay(".24s")}>
              LunchPad began behind a real counter — chasing paper order forms,
              sorting out payment mix-ups, printing labels by hand at 6 AM. It wasn&apos;t
              built by a software company guessing at what operators need. It was
              built by someone who lived it, for the people still living it.
            </p>
            <div className="story-sig reveal" style={delay(".32s")}>
              <span className="sg">— The LunchPad team</span>
              <span className="who">Operators first. Always.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section className="section" id="features">
        <span className="kicker reveal">Everything you need</span>
        <h2 className="section-title reveal" style={delay(".08s")}>
          Built for operators, <em>loved</em> by their customers.
        </h2>
        <p className="section-lead reveal" style={delay(".16s")}>
          From your first location to your fiftieth, every tool works the way a
          busy lunch program actually runs.
        </p>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <div className="feat reveal" key={f.n} style={delay((i % 2) * 0.08 + "s")}>
              <div className="feat-num">{f.n}</div>
              <div>
                <div className="feat-t">{f.t}</div>
                <div className="feat-d">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <div className="how" id="how">
        <div className="how-inner">
          <span className="kicker reveal">How it works</span>
          <h2 className="section-title reveal" style={delay(".08s")}>
            Up and running in <em>three steps.</em>
          </h2>
          <div className="how-steps">
            {STEPS.map((s, i) => (
              <div className="step reveal" key={s.n} style={delay(i * 0.12 + "s")}>
                <div className="step-ic">{s.icon}</div>
                <div className="step-n">{s.n}</div>
                <div className="step-t">{s.t}</div>
                <div className="step-d">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Testimonials ────────────────────────────────────────────── */}
      <section className="section testi" id="testimonials">
        <span className="kicker reveal">Operator stories</span>
        <h2 className="section-title reveal" style={delay(".08s")}>
          The people who run lunch <em>love it here.</em>
        </h2>

        <div className="testi-feature reveal" style={delay(".12s")}>
          <div className="mark" aria-hidden="true">&ldquo;</div>
          <p className="quote">
            I used to spend two hours every Friday collecting orders in a Google
            Form. Now I spend ten minutes on LunchPad — and I never lose a payment.
          </p>
          <div className="who-row">
            <div className="who-av">SR</div>
            <div>
              <div className="who-n">Sarah R.</div>
              <div className="who-r">School lunch coordinator</div>
            </div>
          </div>
        </div>

        <div className="testi-row">
          {TESTIMONIALS.map((t, i) => (
            <div className="testi-card reveal" key={t.initials} style={delay(i * 0.1 + "s")}>
              <Stars size={14} />
              <p className="q">&ldquo;{t.quote}&rdquo;</p>
              <div className="who-row">
                <div className="who-av" style={{ background: t.color }}>{t.initials}</div>
                <div>
                  <div className="who-n">{t.name}</div>
                  <div className="who-r">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <div className="pricing" id="pricing">
        <div className="pricing-inner">
          <span className="kicker reveal">Pricing</span>
          <h2 className="section-title reveal" style={delay(".08s")}>
            Start free for <em>14 days.</em>
          </h2>
          <p className="section-lead reveal" style={delay(".16s")}>
            No credit card to start. No per-order fees. Cancel anytime.
          </p>
          <div className="price-grid">
            {PRICING.map((p, i) => (
              <div
                className={"price-card reveal" + (p.pop ? " pop" : "")}
                key={p.name}
                style={delay(i * 0.1 + "s")}
              >
                {p.pop && <span className="pop-badge">Most popular</span>}
                <div className="price-name">{p.name}</div>
                <div className="price-amt">
                  <span className="cur">$</span>
                  <span className="big">{p.price}</span>
                  <span className="per">/mo</span>
                </div>
                <div className="price-desc">{p.desc}</div>
                <div className="price-feats">
                  {p.feats.map((feat) => (
                    <div className="pf" key={feat}>
                      <Check color={p.pop ? "#D98C5F" : "#2C4031"} size={15} sw={2.6} />
                      {feat}
                    </div>
                  ))}
                </div>
                <Link href="/signup" className={"price-btn " + (p.pop ? "on-green" : "solid")}>
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
          <p className="price-foot reveal">
            Every plan includes the full 14-day trial — explore everything before you pay a cent.
          </p>
        </div>
      </div>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="final">
        <div className="final-box reveal">
          <div className="glow a" />
          <div className="glow b" />
          <div className="final-eyebrow">Ready when you are</div>
          <h2>Spend less time on lunch. <em>Spend more on the food.</em></h2>
          <p>Join the operators already using LunchPad to save hours every week and serve their customers better.</p>
          <div className="final-actions">
            <Link href="/signup" className="btn btn-cream btn-lg">Start free — 14 days</Link>
            <a href="#how" className="btn btn-outline-cream btn-lg">See how it works</a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="brand">
                <span className="brand-mark"><Bowl /></span>
                LunchPad
              </div>
              <p>The lunch program platform built by an operator, for operators. Schools, offices, anywhere you deliver.</p>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
              <Link href="/admin/login">Sign in</Link>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <a href="#testimonials">Operator stories</a>
              <Link href="/contact">Contact</Link>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
          <div className="footer-bot">
            <span>© {new Date().getFullYear()} LunchPad. All rights reserved.</span>
            <div className="links">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
