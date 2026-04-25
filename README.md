# LBB Hot Lunch App — Medina Academy

Hot lunch preorder app for Medina Academy (Redmond & Bellevue campuses) by Local Bigger Burger.

Built on top of [faheeds/school-order](https://github.com/faheeds/school-order) — all backend logic, API routes, Prisma schema, Stripe integration, and email are unchanged. Only the frontend UI/UX has been redesigned as a mobile-first app experience.

## What changed vs the original repo

- **New mobile-first UI** — app shell layout (max 480px), sticky header + bottom nav, card-based design
- **New color system** — green brand (`#15803d`) replacing the teal brand
- **New `app/globals.css`** — app shell CSS, safe area insets for iPhone
- **New `tailwind.config.ts`** — updated brand color palette
- **New `components/app-nav.tsx`** — bottom navigation bar (Home / Order / Weekly / History / Account)
- **New `components/site-header.tsx`** — compact sticky header
- **New `components/ui.tsx`** — full component library (Card, Badge, Btn, Notice, Eyebrow, etc.)
- **All pages rebuilt** with new components while keeping the same data fetching and server actions

## What is identical to the original repo

- `prisma/schema.prisma` — unchanged
- `prisma/seed.ts` — unchanged
- `prisma/migrations/` — unchanged
- `lib/` — all unchanged (auth, db, orders, payments, email, weekly-checkout, etc.)
- `app/api/` — all API routes unchanged
- `types/` — unchanged
- `tests/` — unchanged
- `.env.example` — unchanged
- `docker-compose.yml`, `Dockerfile` — unchanged

## Setup

Same as the original repo:

```bash
npm install
cp .env.example .env.local
# Fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, STRIPE_*, RESEND_API_KEY, GOOGLE_CLIENT_*
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Then open `http://localhost:3000` on your phone browser (or via your local IP on the same WiFi).

## Environment variables

See `.env.example` — same as the original repo.

## Deployment

Deploy to Vercel + Neon (free Postgres):
1. Push this repo to `faheeds/lbb-hotlunch-app`
2. Import on [vercel.com](https://vercel.com)
3. Add all env vars from `.env.example`
4. Run `npm run prisma:seed` once via Vercel CLI or a local connection to the Neon DB
