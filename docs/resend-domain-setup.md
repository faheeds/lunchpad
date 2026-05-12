# Resend sender domain setup for `lunchpad.us`

Tracks task #14. Once complete, all transactional email (order confirmations,
admin invites, parent magic links, cutoff reminders, kitchen sheets) is sent
from `noreply@lunchpad.us` and `support@lunchpad.us` instead of Resend's
default `onboarding@resend.dev` testing address.

## Why this matters

- **Deliverability.** Email from a verified domain has dramatically higher
  inbox placement than mail from a shared Resend test domain. Right now,
  parent order confirmations are likely landing in spam.
- **Operator trust.** Customers see a real `@lunchpad.us` address rather
  than a noreply at a vendor domain they don't recognize.
- **Branding.** Reply-To headers and unsubscribe footers can finally point
  at our own domain.

## Steps

### 1. Create the domain in Resend

Resend dashboard → **Domains → Add Domain**. Enter `lunchpad.us`.

Resend will issue three DNS records to add at the registrar:

| Type  | Name                       | Value                          | TTL   |
| ----- | -------------------------- | ------------------------------ | ----- |
| MX    | `send.lunchpad.us`         | `feedback-smtp.<region>.amazonses.com` (priority 10) | 3600 |
| TXT   | `send.lunchpad.us`         | `"v=spf1 include:amazonses.com ~all"`                | 3600 |
| TXT   | `resend._domainkey.lunchpad.us` | `<DKIM key issued by Resend — long string>`     | 3600 |

The Mail-From subdomain (`send.lunchpad.us`) keeps the bounce/abuse traffic
isolated from the apex domain. Important: do NOT add SPF/DKIM records on the
apex — they go on the `send.` subdomain.

### 2. Add DKIM at the registrar

Wherever `lunchpad.us` is registered (likely Vercel-managed DNS or
your registrar's panel), paste each value exactly as Resend shows it.
Common gotchas:

- Some registrars strip the surrounding quotes from TXT values — leave the
  inner `v=spf1 include:...` exactly as given.
- DKIM keys are long (~200 chars). If your panel rejects them, split into
  multiple chunks per the registrar's instructions, but never split inside
  the base64 string.

### 3. Wait for verification

Resend polls DNS every few minutes. Status goes from `pending` → `verified`
once all three records resolve. Typical: 5-30 minutes; can take up to 24h
on slow DNS providers.

### 4. Switch the from-address

After verification, update `.env` (Vercel project env vars):

```
RESEND_FROM_NOREPLY=noreply@lunchpad.us
RESEND_FROM_SUPPORT=support@lunchpad.us
```

In `lib/email/service.ts`, the `from` field reads from these env vars (or
falls back to a hardcoded default). Confirm the fallback matches before
flipping. Redeploy.

### 5. Smoke test

Send a test order through the customer ordering flow and check:

- Order confirmation arrives at the parent's inbox (not spam folder)
- From-address is `noreply@lunchpad.us`
- Reply-To is `support@lunchpad.us`
- Headers show valid SPF + DKIM signatures (Gmail: "Show original")

### 6. Add the support reply path

The `support@lunchpad.us` address needs to forward somewhere a human reads.
Cheapest: a forwarding rule at the registrar pointing at your personal
inbox (`faheed.subhani@gmail.com`). Add it once the domain verifies.

## Env vars summary

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx   (already set)
RESEND_FROM_NOREPLY=noreply@lunchpad.us       (new — after step 4)
RESEND_FROM_SUPPORT=support@lunchpad.us       (new — after step 4)
```
