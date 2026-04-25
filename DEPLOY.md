# Production deploy — lunch.localbiggerburger.com

This is the end-to-end checklist for getting the LBB Hot Lunch app live on Vercel with Neon Postgres, Stripe live mode, Resend, and Google OAuth, attached to the subdomain `lunch.localbiggerburger.com`.

Work through it in order. Each phase has a "verify" step before moving on.

---

## 0. Prerequisites

You should have, or be ready to create, accounts on:

- Vercel (vercel.com) — free tier is fine to start
- Neon (neon.tech) — Postgres host, free tier is fine to start
- Resend (resend.com) — transactional email, free tier is fine to start
- Stripe (stripe.com) — already have account
- Google Cloud Console (console.cloud.google.com) — already have Workspace/Cloud access
- A DNS control panel for `localbiggerburger.com` (wherever the domain is registered — GoDaddy, Namecheap, Cloudflare, etc.)

Keep a scratch text file open; you will paste ~10 secrets into it before pasting them into Vercel.

---

## Phase 1 — Neon Postgres

1. Sign up at https://neon.tech and create a project.
   - Name it `lbb-hotlunch-prod`.
   - Region: pick one close to your Vercel deploy region — **AWS us-west-2 (Oregon)** is a good match for `America/Los_Angeles`.
   - Postgres version: 16 (default).
2. Once created, open **Connection Details** and copy TWO URLs:
   - **Pooled** connection string (contains `-pooler` in the host). This is `DATABASE_URL`.
   - **Direct** (unpooled) connection string. Save this too — Prisma migrations need it.
3. On your Windows machine, from `C:\Faheed Code\lbb-hotlunch-app`, run migrations against Neon:
   ```powershell
   $env:DATABASE_URL = "paste-the-DIRECT-unpooled-url-here"
   npx prisma migrate deploy
   npx prisma db seed
   ```
   The seed creates the initial admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in your local `.env`. If you want a specific admin in prod, set those two env vars inline before running:
   ```powershell
   $env:SEED_ADMIN_EMAIL = "admin@localbiggerburger.com"
   $env:SEED_ADMIN_PASSWORD = "a-strong-password-you-will-remember"
   npx prisma db seed
   ```

**Verify:** In the Neon SQL editor run `SELECT COUNT(*) FROM "AdminUser";` — should return 1.

---

## Phase 2 — Resend + sender domain

1. Sign up at https://resend.com.
2. **Domains** → **Add Domain** → enter `localbiggerburger.com`.
3. Resend will show a list of DNS records (1 SPF TXT, 3 DKIM CNAMEs, optionally DMARC).
4. Log in to the DNS panel for `localbiggerburger.com` and add each record exactly as shown.
5. Back in Resend, click **Verify**. DNS can take 5–30 minutes.
6. **API Keys** → create a key called `lbb-hotlunch-prod` with "Sending access" scope. Copy the `re_...` value to your scratch file.

**Verify:** Domain status shows "Verified" (green) in Resend.

---

## Phase 3 — Stripe live mode

1. Stripe Dashboard → toggle from **Test mode** to **Live mode** (top-right).
2. **Developers** → **API keys** → reveal and copy:
   - `sk_live_...` → `STRIPE_SECRET_KEY`
   - `pk_live_...` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. We'll come back to add the webhook in Phase 7, after the domain is live.
4. Confirm your Stripe account has completed business onboarding (bank account attached, tax info submitted). Live charges will fail otherwise.

**Verify:** The keys start with `sk_live_` and `pk_live_` (not `sk_test_` / `pk_test_`).

---

## Phase 4 — Google OAuth (prod client)

You can reuse the existing OAuth client or create a new one scoped just to production. Cleaner to create a new one.

1. Google Cloud Console → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**.
2. Application type: **Web application**. Name: `LBB Hot Lunch — prod`.
3. **Authorized JavaScript origins**:
   - `https://lunch.localbiggerburger.com`
4. **Authorized redirect URIs**:
   - `https://lunch.localbiggerburger.com/api/auth/callback/google`
5. Create → copy **Client ID** and **Client Secret** to your scratch file.
6. If the OAuth consent screen is in "Testing" mode, either publish it (recommended) or add parent emails as test users.

**Verify:** Both values present; redirect URI exactly matches (no trailing slash).

---

## Phase 5 — Deploy to Vercel

1. Push the project to GitHub (or GitLab / Bitbucket) if not already. Private repo is fine.
   ```powershell
   cd C:\Faheed Code\lbb-hotlunch-app
   git init
   git add .
   git commit -m "Initial deploy"
   gh repo create lbb-hotlunch-app --private --source=. --push
   ```
   (If `gh` isn't installed, create the repo in the GitHub UI and `git remote add origin ...` then push.)

2. Vercel → **Add New** → **Project** → import the repo.
3. Framework: Next.js (auto-detected). Leave build/output settings at defaults.
4. **Environment Variables** — add all of these for **Production** (you can tick "Preview" too if you want):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** URL from Phase 1 |
   | `NEXTAUTH_URL` | `https://lunch.localbiggerburger.com` |
   | `NEXTAUTH_SECRET` | Generate a new one: run `openssl rand -hex 32` locally |
   | `GOOGLE_CLIENT_ID` | from Phase 4 |
   | `GOOGLE_CLIENT_SECRET` | from Phase 4 |
   | `STRIPE_SECRET_KEY` | `sk_live_...` from Phase 3 |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` from Phase 3 |
   | `STRIPE_WEBHOOK_SECRET` | placeholder `whsec_placeholder` — we'll replace after Phase 7 |
   | `RESEND_API_KEY` | from Phase 2 |
   | `EMAIL_FROM` | `orders@localbiggerburger.com` |
   | `EMAIL_FROM_NAME` | `LBB Hot Lunch` |
   | `APP_BASE_URL` | `https://lunch.localbiggerburger.com` |
   | `DEFAULT_TIMEZONE` | `America/Los_Angeles` |

5. Click **Deploy**. First build takes 2–4 minutes.

**Verify:** Deploy succeeds. Visit the temporary `*.vercel.app` URL — the homepage should render (OAuth/Stripe won't work yet because the domain is wrong, that's expected).

---

## Phase 6 — Attach custom domain

1. Vercel → your project → **Settings** → **Domains** → **Add** → `lunch.localbiggerburger.com`.
2. Vercel will show a DNS record to create. Typically:
   - Type: **CNAME**
   - Host/Name: **lunch**
   - Value: **cname.vercel-dns.com**
3. Go to your DNS panel for `localbiggerburger.com` and add that CNAME record.
4. Back in Vercel, wait until the domain status shows **Valid Configuration** and the lock icon appears (SSL provisioned automatically).

**Verify:** `https://lunch.localbiggerburger.com` loads the app with a valid SSL certificate.

---

## Phase 7 — Stripe webhook (now that domain is live)

1. Stripe Dashboard (Live mode) → **Developers** → **Webhooks** → **Add endpoint**.
2. Endpoint URL: `https://lunch.localbiggerburger.com/api/stripe/webhook`
3. Events to send (click "Select events"):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
4. Create endpoint → click into it → **Signing secret** → reveal → copy the `whsec_...` value.
5. Vercel → **Settings** → **Environment Variables** → edit `STRIPE_WEBHOOK_SECRET` → paste the real value.
6. Vercel → **Deployments** → latest → **⋯** → **Redeploy** (so the new env var takes effect).

**Verify:** In Stripe webhook detail page, click **Send test webhook** → pick `checkout.session.completed` → send. The log entry should show HTTP 200.

---

## Phase 8 — Production smoke test

Run through the real user flows on `https://lunch.localbiggerburger.com`:

1. **Admin login**
   - `/admin/sign-in` → log in with the seeded admin credentials.
   - Admin dashboard loads.
2. **Schedule delivery dates**
   - If none exist yet, admin → create a school (if needed) and delivery dates for the upcoming week.
3. **Parent sign-up via Google**
   - Sign out. Visit `/account/sign-in`. Click **Continue with Google**.
   - Completes OAuth and lands on the parent dashboard.
4. **End-to-end order**
   - Add a child, pick a weekday + menu item, proceed to checkout.
   - Stripe Checkout appears with **live** branding (no test-mode banner). Use a real card — expect an actual charge. (You can refund yourself immediately in Stripe.)
5. **Post-payment**
   - Redirects back to the success page.
   - Confirmation email arrives from `orders@localbiggerburger.com`.
   - Admin dashboard shows the order as PAID.
   - Stripe Dashboard shows the payment as succeeded and the webhook as 200 OK.

If any step fails, check Vercel → **Logs** (realtime) while repeating the failing action — most issues are missing/mismatched env vars.

---

## Rollback / ops notes

- **Rotating a secret:** update in Vercel env vars → redeploy. Nothing in the app caches them across deploys.
- **Rolling back a bad deploy:** Vercel → Deployments → find the last known-good → **⋯** → **Promote to Production**.
- **DB migration in prod:** run `npx prisma migrate deploy` locally against the Neon **direct** URL (not pooled). Keep migration SQL in git.
- **Adding a new admin:** easiest is to bump `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in a local shell and re-run `npx prisma db seed` against the Neon direct URL. The seed is idempotent on email.
