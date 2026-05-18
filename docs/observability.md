# LunchPad Observability & Alerting

This document outlines the observability strategy for LunchPad and recommended alert configuration in Sentry.

## Structured Logging

All critical server actions and API handlers emit structured JSON logs to stdout with the following fields:

- `level`: Log level (info, warn, error)
- `message`: Human-readable message
- `ts`: ISO 8601 timestamp
- `action`: Name of the server action or handler (e.g., "createOrder", "cancelOrder")
- `restaurantId`: Multi-tenant scope (when applicable)
- `userId`: User ID (when applicable) — may be adminUserId or parentUserId depending on context
- `durationMs`: Operation duration in milliseconds
- `[key: string]`: Additional context fields

Example log output:
```json
{
  "level": "info",
  "message": "createPendingOrder started",
  "ts": "2026-05-18T12:34:56.789Z",
  "action": "createPendingOrder",
  "parentUserId": "parent_123"
}
```

Errors also forward to Sentry via the existing `@sentry/nextjs` integration, with structured context attached.

## Instrumented Actions

The following server actions and handlers are instrumented with timing and logging:

### Order Management
- **createPendingOrder** (lib/orders.ts) — Customer self-service order creation via Stripe Checkout
- **createAdminOrder** (lib/orders.ts) — Admin manual order creation (comped, manual payment, or checkout link)
- **cancelOrderWithRefund** (lib/orders.ts) — Customer-initiated order cancellation with Stripe refund

### Delivery Schedule
- **createDeliveryDate** (app/admin/delivery-dates/page.tsx) — Admin creates a single delivery date

### Menu Management
- **bulkCreateMenuItems** (app/api/admin/menu/bulk-create/route.ts) — Bulk upload of menu items via Excel or JSON

### Onboarding & Sample Data
- **seedSampleData** (app/admin/onboarding/page.tsx) — Operator setup: creates sample school, menu items, and delivery date
- **resetSampleData** (app/admin/settings/page.tsx) — Clears all "[Sample]" data after testing

## Recommended Sentry Alert Rules

Configure these alerts in the Sentry UI. All thresholds and time windows are suggestions and should be tuned based on your SLA requirements.

### 1. Error Rate Spike

**Alert**: Error rate sustained above 1% for 5 minutes

**Condition**:
- Environment: production
- Threshold: error_count > 1% of total events
- Time window: 5 minutes sustained

**Recommended Actions**:
- Alert: Slack #incidents
- Severity: Critical if > 5%, Warning if 1–5%
- Context: Check recent deployments; correlation with order creation or delivery date changes

**Why**: A 1% error rate indicates systemic failures affecting customer ordering or admin operations. Quick response prevents cascading order loss and supports fulfillment.

---

### 2. P95 Latency Threshold

**Alert**: P95 latency on order operations exceeds 2 seconds

**Condition**:
- Filter: `action:(createPendingOrder OR createAdminOrder OR cancelOrderWithRefund)`
- Metric: transaction.duration
- Threshold: p95(duration) > 2000ms
- Time window: 5 minutes

**Recommended Actions**:
- Alert: Slack #infrastructure (for DB scaling concerns)
- Severity: Warning

**Why**: Order operations should complete in <1s under normal load. Sustained >2s latency indicates database contention, missing indexes, or external API delays (Stripe). Early warning allows for scaling before customer impact.

---

### 3. Stripe Webhook Signature Failures

**Alert**: Repeated Stripe webhook signature validation errors

**Condition**:
- Filter: `message:"Stripe" AND level:error`
- Pattern: "signature" OR "webhook"
- Threshold: count > 5 in 10 minutes

**Recommended Actions**:
- Alert: Slack #payments (Faheed)
- Severity: Critical
- Resolution: Check that `STRIPE_WEBHOOK_SECRET` is synced to all production deployments; rotate webhook signing keys if compromised

**Why**: Signature failures block order payment finalization (webhook → order marked PAID). Multiple failures suggest deployment inconsistency or key rotation issues.

---

### 4. 500 Errors from /api/admin/*

**Alert**: 5xx errors from admin API routes

**Condition**:
- Filter: `url:("/api/admin/*") AND status:>=500`
- Threshold: count > 2 in 5 minutes

**Recommended Actions**:
- Alert: Slack #incidents
- Severity: Critical

**Why**: Admin API errors block order creation, menu uploads, and delivery date management. Detect and page immediately.

---

### 5. Discount Application Failures

**Alert**: Discount redemption or application errors

**Condition**:
- Filter: `action:("createPendingOrder" OR "createAdminOrder") AND level:error AND message:*discount*`
- Threshold: count > 3 in 15 minutes

**Recommended Actions**:
- Alert: Slack #support
- Severity: Warning

**Why**: Discount failures don't block orders (they fail gracefully) but should be tracked. Recurring patterns indicate schema or business logic issues.

---

### 6. Bulk Menu Upload Failures

**Alert**: High error rate during bulk menu item creation

**Condition**:
- Filter: `action:bulkCreateMenuItems AND errorCount:>0`
- Threshold: avg(errorCount) > 10% of items per batch
- Time window: 15 minutes

**Recommended Actions**:
- Alert: Slack #support
- Severity: Warning
- Context: Include error details (duplicate slugs, invalid prices, etc.)

**Why**: Bulk uploads should succeed for >90% of items. High failure rates indicate data quality or validation logic issues. Support should proactively reach out to operators.

---

### 7. Sample Data Operations Taking Too Long

**Alert**: Onboarding sample data seeding or reset exceeds 30 seconds

**Condition**:
- Filter: `action:(seedSampleData OR resetSampleData)`
- Metric: durationMs
- Threshold: p95(durationMs) > 30000
- Time window: 10 minutes

**Recommended Actions**:
- Alert: Slack #infrastructure
- Severity: Warning

**Why**: Sample data setup should be instant (< 5s typical). Sustained slowness indicates DB performance issues or queries that haven't been optimized. Alert allows for index tuning before it affects production order paths.

---

## Dashboard Recommendations

Create a Sentry dashboard with:

1. **Error rate timeline** — 1h, 24h, 7d views
2. **P50 / P95 / P99 latency** for each instrumented action
3. **Error grouping** by `action` field to quickly spot which operation is failing
4. **Geographic/tenant breakdown** — count of errors per `restaurantId` if multi-region
5. **Top error messages** — sorted by frequency over the past 24h

## Testing Alerts

After configuring, send a test error to Sentry:
```bash
node -e "require('@sentry/node').captureException(new Error('Test alert'))"
```

Verify that Slack notifications fire as expected.

## Future Improvements

- Add request tracing (correlate Stripe webhook events with order.id for end-to-end latency)
- Track Kitchen Sheet PDF generation performance
- Monitor email delivery (Resend API success rates)
- Add custom metrics for order throughput (orders/minute, revenue/hour)
