# LBB Hot Lunch — iOS app handoff

This file is a handoff for building an iOS app companion to the LBB Hot Lunch
web app. It exists so a fresh chat (potentially a different model) can pick up
with full context and without risking any change to the production web app.

## Ground rules

- **Do not modify** anything in `C:\Faheed Code\lbb-hotlunch-app` except
  backend API surface additions that are strictly additive (new routes under
  `app/api/...`). No changes to existing routes, pages, schema, or Stripe/
  webhook behavior. The web app is live at
  `https://lunch.localbiggerburger.com` and is already in production use.
- **Put the iOS project in a new folder**: `C:\Faheed Code\lbb-hotlunch-ios`.
  It lives in its own Git repo. Do not add iOS code under
  `C:\Faheed Code\lbb-hotlunch-app`.
- Apple Developer Program membership is paid and active for Faheed under
  **faheed@live.com** (not the gmail address). Use this Apple ID for App Store
  Connect, code signing, and TestFlight invites. The gmail account
  (faheed.subhani@gmail.com) is only used for Cowork/Anthropic-side login.

## Web app summary

Deployed at `https://lunch.localbiggerburger.com`.

Stack:
- Next.js 15 (App Router), React 19, TypeScript
- Prisma 5.22 against Neon Postgres (us-west-2)
- NextAuth v5 beta, Google OAuth for parents, credentials for admins
- Stripe Checkout (live), webhook at `/api/stripe/webhook`
- Resend for transactional email from `orders@localbiggerburger.com`
- Hosted on Vercel; custom domain via CNAME

Two parent user flows:
1. **Single-day order** — pick school → delivery date → menu → checkout.
2. **Weekly plan** — pick a meal per weekday, one Stripe checkout bundles the
   week.

Two schools seeded: Medina Academy Redmond, Medina Academy Bellevue. Cutoff
defaults to 9:00 PM the day before delivery. No weekend delivery dates.

## API surface the iOS app will call

All endpoints are under `https://lunch.localbiggerburger.com`. Relevant ones:

- `POST /api/auth/signin` (NextAuth) — handles Google OAuth via redirect.
  **For iOS this won't work directly** — see "Auth" below.
- `GET /api/account/children` — list saved children (session-auth'd)
- `POST /api/account/children` — add child
- `GET /api/account/weekly-plans` — list weekly plans
- `POST /api/account/weekly-plans` — create weekly plan item
- `PATCH /api/account/weekly-plans` — toggle isActive
- `DELETE /api/account/weekly-plans` — remove plan item
- `POST /api/account/weekly-checkout` — create Stripe Checkout session for the
  weekly plan (returns a Stripe-hosted URL)
- `POST /api/order` — create a single-day order (returns Stripe Checkout URL)
- `GET /api/delivery-dates?schoolId=...` — list upcoming open delivery dates
- `GET /api/menu?deliveryDateId=...` — menu items available for a date

All session-auth'd routes use a NextAuth `session` cookie. Read
`lib/parent-auth.ts` → `requireParent()` / `assertParentApiRequest()` for the
current session contract.

**For a native iOS client, the session-cookie model is awkward.** Pick one of:
- (a) Add a mobile-token endpoint: `POST /api/mobile/session` that exchanges a
  Google ID token (obtained via native Google Sign-In SDK or Sign in with Apple)
  for a Bearer token (JWT) the app sends on every subsequent request. Existing
  web routes keep the cookie flow; new `/api/mobile/*` routes honor Bearer.
- (b) Embed an auth WebView just for the OAuth dance, capture the session
  cookie, and attach it to native fetches. More brittle, avoid.

Recommend (a). It's purely additive on the web app (new routes only, no
changes to existing).

## App Store review constraints — read before picking an approach

1. **Guideline 4.2 "Minimum Functionality"** — Apple rejects apps that are
   "just a repackaged website" or a thin WebView wrapper with no native
   value. A Capacitor/WebView shell must add at least one meaningful native
   feature: push notifications for order confirmations, Sign in with Apple,
   haptics, offline cache, biometric unlock, etc.
2. **Guideline 4.8 "Login Services"** — If the app uses Google Sign-In, it
   **must also offer Sign in with Apple** at equal prominence. The web app
   only offers Google today; the iOS version will need Sign in with Apple
   wired up.
3. **Guideline 3.1.1 "In-App Purchase"** — Lunch is a **physical service**
   (food delivered to school), so Stripe Checkout is permitted. IAP is not
   required. Do *not* call it "digital goods" anywhere.
4. **Guideline 5.1.1 Privacy** — App Privacy labels must be filled out in
   App Store Connect. Declare: Name, Email, Purchase History, User ID.
5. **App Transport Security** — Everything is HTTPS already; no exceptions
   needed.

## Recommended approach: Capacitor + SwiftUI native shells

Rationale:
- Faheed is a solo operator, not a full-time iOS engineer. A pure native
  SwiftUI rebuild triples the work and duplicates every screen.
- The web app is already mobile-first (480px max, touch-first UI, sticky
  bottom nav). It will feel like a native app inside a Capacitor shell.
- Capacitor gives us native plugins (push, Sign in with Apple, biometrics,
  haptics) to satisfy guideline 4.2.
- The Next.js app stays untouched; Capacitor just loads
  `https://lunch.localbiggerburger.com` in a `WKWebView` with a native shim.

Minimum native features to add inside the Capacitor iOS project:
1. **Sign in with Apple** — required by 4.8 since we use Google. Use
   `@capacitor-community/apple-sign-in` → post the identity token to a new
   `/api/mobile/auth/apple` endpoint on the web app that creates/links a
   `ParentUser` and returns a Bearer JWT.
2. **Push notifications** — use `@capacitor/push-notifications`. Register the
   APNs token with a new `/api/mobile/push/register` endpoint. Server-side,
   send a push on `checkout.session.completed` alongside the existing email
   via a simple APNs HTTP/2 call.
3. **Haptics on checkout success** — `@capacitor/haptics`, tiny but
   reviewer-visible native feature.
4. **Status bar + safe area styling** — `@capacitor/status-bar`.

Alternatives considered:
- **Pure SwiftUI** — more polished but 4–8 weeks of work vs 1 week for
  Capacitor. Defer until there's revenue justifying the investment.
- **React Native / Expo** — similar timeline to Capacitor but requires
  porting every screen to RN components. Doesn't reuse the existing Next.js
  UI. Skip.
- **PWA only (no App Store)** — simplest, but Faheed has already paid for the
  Apple Developer Program and wants App Store distribution.

## Suggested first milestone (1 week, solo)

Day 1 — Scaffolding
- `npm create @capacitor/app@latest` in `C:\Faheed Code\lbb-hotlunch-ios`
- `npx cap add ios`; open in Xcode; confirm it builds and runs on simulator
  loading the production URL
- Configure `capacitor.config.ts` → server URL to prod

Day 2 — Auth
- Add `/api/mobile/auth/apple` and `/api/mobile/auth/google` on the web app
  (additive only). Each accepts an identity token, verifies it with the
  provider's JWKS, upserts `ParentUser`, issues a signed JWT Bearer token.
- Add a native Capacitor plugin for Apple Sign-In. Inject the token into the
  WebView via `localStorage` + a small auth bridge so the web app's existing
  session layer can pick it up, *or* route all mobile API calls through a
  native fetch layer using the Bearer token.

Day 3 — Push
- `@capacitor/push-notifications` registration flow
- `/api/mobile/push/register` to store (parentUserId, apnsToken) pair
- Hook into Stripe webhook success path to fire a push via APNs HTTP/2

Day 4 — Polish + review prep
- Haptics on checkout success screen
- App icon, splash screen, launch storyboard
- App Store Connect entry, privacy labels, screenshots (iPhone 15 Pro + 6.7")

Day 5 — TestFlight submission
- Archive and upload via Xcode (signed under the faheed@live.com Apple ID)
- Wait for processing; invite faheed@live.com as a tester

## Prompt to paste into the new chat

Copy the block below into a new Cowork chat. Switch the model to
Claude Sonnet 4.6 (or 4.5) if you want to conserve Opus usage — Sonnet is
plenty for scaffolding a Capacitor project and writing native auth glue.

---

> I want to build an iOS companion app to my production Next.js web app at
> `https://lunch.localbiggerburger.com`. Please read
> `C:\Faheed Code\lbb-hotlunch-app\IOS_HANDOFF.md` first — it has the full
> context: tech stack, API surface, App Store constraints, and the
> recommended approach (Capacitor + a few native plugins). Do not change
> anything under `C:\Faheed Code\lbb-hotlunch-app`; the iOS project goes in
> a brand-new folder at `C:\Faheed Code\lbb-hotlunch-ios`. I have a paid
> Apple Developer account under **faheed@live.com** (that's the Apple ID —
> the gmail account is unrelated). Start with Day 1 of
> the suggested first milestone and check in with me after the simulator
> boots and loads the production URL.

---

## Files the new chat should open first

1. `C:\Faheed Code\lbb-hotlunch-app\IOS_HANDOFF.md` — this file
2. `C:\Faheed Code\lbb-hotlunch-app\prisma\schema.prisma` — data model
3. `C:\Faheed Code\lbb-hotlunch-app\lib\parent-auth.ts` — current session
   contract (to design the Bearer-token equivalent)
4. `C:\Faheed Code\lbb-hotlunch-app\app\api\account\weekly-plans\route.ts` —
   example of a session-auth'd API route
5. `C:\Faheed Code\lbb-hotlunch-app\app\api\stripe\webhook\route.ts` — to
   splice push-notification send on payment success
