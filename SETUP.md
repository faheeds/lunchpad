# LunchPad — New Project Setup Guide

This project is a clean copy of the LBB Hot Lunch app, repurposed as the
**LunchPad** multi-tenant SaaS platform (lunchpad.us).

> ⚠️  Do NOT touch `C:\Faheed Code\lbb-hotlunch-app` — that is the live
> production app with real orders.

---

## Step 1 — Initialize Git & Push to GitHub

Run these commands in PowerShell from `C:\Faheed Code\lunchpad`:

```powershell
cd "C:\Faheed Code\lunchpad"
git init
git branch -M main
git add -A
git commit -m "Initial commit — LunchPad platform"
```

Then on GitHub:
1. Go to https://github.com/new
2. Name the repo `lunchpad` (keep it private)
3. Do NOT initialize with README or .gitignore
4. Copy the remote URL they give you, then:

```powershell
git remote add origin https://github.com/faheeds/lunchpad.git
git push -u origin main
```

---

## Step 2 — Create a New Neon Database

1. Go to https://neon.tech and sign in
2. Click **New Project** → name it `lunchpad`
3. Choose the same region as your production DB (e.g. US East)
4. Copy the **Connection string** (starts with `postgresql://...`)
5. Save it — this is your `DATABASE_URL`

---

## Step 3 — Set Up Environment Variables

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` and fill in:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Neon project → Connection string |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` in any terminal |
| `NEXTAUTH_URL` | `https://app.lunchpad.us` (or your Vercel preview URL for now) |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console — create NEW OAuth credentials |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (use test keys to start) |
| `RESEND_API_KEY` | resend.com → API Keys → create new |
| `EMAIL_FROM` | `noreply@lunchpad.us` (once domain is verified in Resend) |
| `APP_BASE_URL` | Same as `NEXTAUTH_URL` |

---

## Step 4 — Run Database Migrations

```powershell
cd "C:\Faheed Code\lunchpad"
npm install
npx prisma migrate deploy
npx prisma db seed    # optional — seeds demo data
```

---

## Step 5 — Deploy to Vercel

1. Go to https://vercel.com/new
2. Import the `lunchpad` GitHub repo
3. Framework: **Next.js** (auto-detected)
4. Add all environment variables from `.env.local` in the Vercel dashboard
5. Set custom domain: `app.lunchpad.us` → point to Vercel's nameservers

---

## Step 6 — Update Google OAuth Redirect URIs

In Google Cloud Console → your NEW OAuth app → Authorized redirect URIs, add:
```
https://app.lunchpad.us/api/auth/callback/google
```

---

## What's Still LBB-branded (to update over time)

- `components/site-header.tsx` — "Local Bigger Burger" / "Medina Academy Hot Lunch" text
- `app/globals.css` — color palette (dark red #1c0505, crimson #c41230)
- `prisma/seed.ts` — seeded school/restaurant name
- Email templates in `lib/email/templates.ts`
- Any hardcoded school references in `app/(marketing)/` page copy

These are intentionally left for you to update as you build out the
multi-tenant version — they won't break anything in the meantime.

---

## Architecture Notes for Multi-Tenant SaaS

The main things to add before selling this to other restaurants:

1. **`restaurantId` on every table** — currently single-tenant
2. **Subdomain routing** — `{slug}.lunchpad.us` per restaurant
3. **Restaurant onboarding flow** — sign up, configure menu, connect Stripe
4. **Stripe Connect** — each restaurant gets their own connected account
5. **Admin super-panel** — manage all restaurants from one view

See the product roadmap for prioritized order of implementation.
