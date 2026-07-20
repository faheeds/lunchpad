# LunchPad — Claude Code Context

## What This Is
LunchPad is a multi-tenant SaaS platform for school lunch and office catering operators. Restaurant owners sign up, configure their menu and delivery schedule, and customers order online. Each restaurant gets its own subdomain (e.g. `fsskitchen.lunchpad.us`).

The production deployment lives at `lunchpad.us` (apex marketing site) with per-tenant subdomains at `*.lunchpad.us`. Owner: Faheed Subhani (faheed.subhani@gmail.com).

> The earliest demo tenant was "FS's Kitchen" running a Mon-Thu school-lunch
> schedule. The platform is now multi-tenant — do NOT hardcode anything around
> that operator's name, weekday range, menu categories, or required-choices map.
> Anything that used to assume those values should now read from the
> Restaurant / School / MenuItem records.

## Tech Stack
- **Framework**: Next.js 15 App Router (server components, server actions)
- **Database**: PostgreSQL via **Prisma ORM** (`prisma/schema.prisma`)
- **Auth**: NextAuth v5 (`lib/auth.ts`) — credentials-based for admin, magic link / Google for parents
- **Payments**: Stripe (subscriptions + Connect for restaurant payouts)
- **Email**: Resend (`lib/email/service.ts`)
- **Styling**: Tailwind CSS — mobile-first, ~390px viewport
- **Excel**: SheetJS (`xlsx` ^0.18.5) — server-side template generation, client-side parsing
- **Timezone**: `date-fns-tz` — always use `fromZonedTime` / `formatInTimeZone` with school's timezone

## Project Structure
```
app/
  (public)/          — parent-facing ordering pages
  admin/(protected)/ — restaurant admin dashboard
    dashboard/       — overview stats
    orders/          — order management
    menu/            — menu items + bulk upload
    delivery-dates/  — schedule management
    schools/         — school management
    reports/         — revenue/order analytics
    team/            — admin user management
    settings/        — restaurant profile + theme
    subscription/    — Stripe plan management
    setup/           — onboarding wizard (new restaurants)
  api/
    admin/           — admin API routes (menu template, bulk-create, export CSV)
    mobile/          — mobile app auth endpoints
    orders/          — order modification/cancellation
    stripe/          — webhook handlers
components/
  admin/             — admin UI components (orders-list, bulk-menu-upload, theme-picker, etc.)
  site-header.tsx    — parent-facing header
lib/
  auth.ts            — NextAuth config
  db.ts              — Prisma client singleton
  restaurant.ts      — tenant resolution (see critical note below)
  admin-auth.ts      — role-based admin auth (OWNER > MANAGER > STAFF)
  admin.ts           — getAdminReports(), dashboard stats
  orders.ts          — order helpers, cancelOrderWithRefund
  email/             — Resend email templates
  env.ts             — Zod-validated env vars
prisma/
  schema.prisma      — multi-tenant schema
```

## Critical Architecture: Multi-Tenancy

### Subdomain Routing (middleware.ts)
- Production: `fsskitchen.lunchpad.us` → extracts slug `fsskitchen` → sets `x-restaurant-slug` header
- Vercel preview / localhost: reads `RESTAURANT_SLUG` env var (should be **unset** in production Vercel to show platform landing page)
- `ROOT_DOMAIN` env var defaults to `lunchpad.us`

### Restaurant Resolution (lib/restaurant.ts)
- `getCurrentRestaurant()` — reads `x-restaurant-slug` header only. Returns `null` on root domain → shows platform marketing page. Used by public pages.
- `requireRestaurant()` — tries subdomain first, then falls back to admin session's `restaurantId`. Used by all `/admin/*` pages so they work on the Vercel root URL when logged in.

**Do NOT add session fallback to `getCurrentRestaurant()`** — it caused the platform homepage to show the restaurant ordering page when an admin was logged in.

### Admin Roles
Three roles: `OWNER > MANAGER > STAFF`. Use `requireAdminRole("OWNER")` / `"MANAGER"` at top of server actions and page fetches.

## Environment Variables (see .env.example)
```
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH / STRIPE_PRICE_SCALE
RESEND_API_KEY
ROOT_DOMAIN          — e.g. lunchpad.us (do NOT set RESTAURANT_SLUG in production)
ANTHROPIC_API_KEY    — optional, used by bulk menu AI extraction
```

## Key Patterns

### Server Actions
All form mutations use Next.js server actions (`"use server"` inside async functions). Pattern:
```typescript
async function doThing(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");
  // ... mutation
  revalidatePath("/admin/...");
}
```

### searchParams are Promises in Next.js 15
```typescript
export default async function Page({ searchParams }: { searchParams: Promise<{ foo?: string }> }) {
  const params = await searchParams;
}
```

### Timezone-Aware Dates
Always fetch `school.timezone` from DB before converting user-input dates:
```typescript
const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
const utcDate = fromZonedTime(`${dateStr} 11:00:00`, school.timezone);
```

### File Picker Pattern
Use `<label htmlFor={id}>` wrapping the drop zone — never `div.onClick → input.click()` (unreliable in server action forms). Use `useId()` for stable IDs.

### Order Counts on Delivery Dates
```typescript
prisma.deliveryDate.findMany({
  include: { _count: { select: { orders: { where: { status: "PAID" } } } } }
})
// Access as: date._count.orders
```

## Recently Built / Current State (as of May 2026)
All pages have been redesigned and are ready to push:

- **Orders page** — stat tiles, filter bar (school/date/status/archived), collapsible order cards, bulk actions
- **Orders list component** — Set-based selection, expanded detail view, allergy badges, OrderStatusActions
- **Settings page** — ordering URL card with CopyUrlButton, subscription status, danger zone
- **Delivery Dates page** — calendar tiles, order count badges, timezone bug fixed, "View orders →" links
- **Team page** — avatar initials with deterministic colors, role legend, collapsible add-member form
- **Reports page** — 4 stat tiles, per-delivery-date breakdown with revenue bars, item performance ranking
- **Bulk menu upload** — Excel template download + client-side parse, preview with inline editing, `/api/admin/menu/bulk-create`

### Pending Push
Run `push-fix.bat` from `C:\Faheed Code\lunchpad` to stage and push all recent changes to Vercel.

Files staged in push-fix.bat:
- `app/admin/(protected)/orders/page.tsx`
- `components/admin/orders-list.tsx`
- `app/admin/(protected)/settings/page.tsx`
- `components/admin/copy-url-button.tsx`
- `app/admin/(protected)/delivery-dates/page.tsx`
- `app/admin/(protected)/team/page.tsx`
- `app/admin/(protected)/reports/page.tsx`
- `lib/restaurant.ts` (platform homepage fix)

## Lane rules — agents

Two lanes. Each agent owns specific files and must never touch the other lane's files. If dev
and QA need the same file, they coordinate through the lead — never in parallel.

**dev** → all source code: `app/`, `components/`, `lib/` (excluding test files), `scripts/` —
implementation only, never test files. Per `docs/agent-pipeline.md`, changes to `lib/orders.ts`,
`app/api/stripe/*`, admin auth, or `prisma/schema.prisma` need explicit lead sign-off before dev
proceeds — these are money/auth/schema blast-radius files.

**qa** → ALL test files (`tests/*.test.ts`, `vitest.config.ts`) — QA owns test authorship end to
end.

### QA lane — hard rules

QA owns every test file. Dev writes SOURCE CODE ONLY and never authors test cases — if dev
believes a test is needed, it describes the test case to the lead in plain language; the lead
routes it to QA.

QA branches are named `qa/<short-desc>`, NOT `agent/<short-desc>`.

Every happy-path test needs at least one adversarial test (boundary, malformed input, race
condition, cross-tenant access attempt where relevant). No flaky tests. No tests that hit
production services (Stripe live mode, production DB).

When a test fails, QA documents the disagreement between expected and actual behavior as a
finding — QA does not fix application code.

### Lead responsibilities

The lead agent (this session) reads incoming tickets, decides whether each requires dev work,
QA work, or both, and dispatches accordingly using this session's own subagent tooling rather
than doing both kinds of work directly in the main thread. The lead resolves conflicts when dev
and QA need the same file, and is responsible for opening/merging PRs whose scope spans both
lanes' commits. Per this repo's existing convention, PRs for money-adjacent changes
(`lib/orders.ts`, refunds, Stripe) should be opened but not auto-merged — leave those for human
review.

## Known Issues / Watch Out For
- `.git/index.lock` sometimes left by Windows — `push-fix.bat` clears it automatically
- Prisma `$queryRaw` fallback in `restaurant.ts` is for legacy DB schema compatibility — keep it
- `getAdminReports()` in `lib/admin.ts` doesn't expose per-delivery-date breakdown; the reports page does a second Prisma query for that
- The `BulkMenuUpload` component uses dynamic import of `xlsx` to avoid SSR issues

## Git / Deploy
- Repo: local git at `C:\Faheed Code\lunchpad`
- Deploy: Vercel (auto-deploys on push to `main`)
- Use `push-fix.bat` from Windows when git lock issues occur (common with Windows file system)
