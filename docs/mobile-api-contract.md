# Mobile API Contract

> This document is the source of truth for the mobile API surface. When adding
> or modifying any route under `app/api/mobile/native/*`, update this doc in
> the same PR. If you find a discrepancy between this doc and the code, the
> code is authoritative but the doc must be fixed.

All routes live under `/api/mobile/native/*` and are consumed by the LunchPad
React Native / iOS app.

## Conventions

- **Base URL / tenant scoping**: the iOS app targets a restaurant-specific
  subdomain (e.g. `fsskitchen.lunchpad.us`). `middleware.ts` extracts the slug
  into an `x-restaurant-slug` header; routes then call `requireRestaurant()` /
  `getCurrentRestaurant()` to resolve the tenant. Hitting the apex domain will
  fail with 404 on tenant-scoped routes.
- **Auth**: protected routes take a Bearer JWT in the `Authorization` header.
  `requireMobileAuth` accepts both native long-lived tokens (`native-jwt.ts`,
  90-day) and short-lived WebView handoff tokens (`mobile-jwt.ts`). The token's
  embedded `restaurantId` must match the tenant resolved from the request host,
  otherwise the request is rejected.
- **CORS**: every route exports `OPTIONS` (from `lib/mobile-bearer`) and
  responds with `Access-Control-Allow-Origin: *` on success and error.
- **Errors**: JSON `{ "error": string }` with an appropriate HTTP status.

---

## GET /api/mobile/native/info

- **Method**: GET
- **Auth**: none (anonymous OK)
- **Request**: no body / no params
- **Tenant scoping**: `requireRestaurant()` — from subdomain
- **Success (200)**: restaurant branding payload
  ```json
  {
    "id": "...", "name": "...", "slug": "...",
    "logoUrl": "...|null", "heroImageUrl": "...|null",
    "primaryColor": "...|null", "accentColor": "...|null", "darkColor": "...|null",
    "heroTitleColor": "...|null", "heroAccentColor": "...|null", "bodyTextColor": "...|null",
    "displayFont": "...|null", "bodyFont": "...|null",
    "contactEmail": "...|null", "contactPhone": "...|null"
  }
  ```
- **Errors**: `404 { error: "Restaurant not found" }` when the host does not
  resolve to an active tenant.

---

## GET /api/mobile/native/menu

- **Method**: GET
- **Auth**: none (anonymous OK)
- **Request**: no body / no params
- **Tenant scoping**: `requireRestaurant()` — from subdomain; returns only
  active `MenuItem` rows for that restaurant
- **Success (200)**:
  ```json
  {
    "restaurantName": "...",
    "categories": [
      {
        "title": "...",
        "items": [
          {
            "id": "...", "slug": "...", "name": "...", "description": "...",
            "imageUrl": "...|null", "basePriceCents": 0, "dietaryTags": ["..."],
            "requiredChoices": ["..."],
            "sizes": [{ "id": "...", "name": "...", "priceCents": 0 }],
            "options": [{ "id": "...", "name": "...", "optionType": "...", "priceDeltaCents": 0 }]
          }
        ]
      }
    ]
  }
  ```
- **Errors**: `500 { error: "Failed to load menu" }`

---

## GET /api/mobile/native/delivery-dates

- **Method**: GET
- **Auth**: none (anonymous OK)
- **Request**: no body / no params
- **Tenant scoping**: `requireRestaurant()` — filters `deliveryDate` rows by
  `school.restaurantId`. Only returns dates with `orderingOpen: true` and
  `cutoffAt > now`.
- **Success (200)**: array of delivery dates with per-date menu and sold-out set
  ```json
  [
    {
      "id": "...", "schoolId": "...",
      "deliveryDate": "ISO", "cutoffAt": "ISO",
      "orderingOpen": true,
      "school": { "id": "...", "name": "...", "timezone": "...", "locationType": "..." },
      "soldOut": ["menuItemId", "..."],
      "menuItems": [{ /* same shape as /menu items, no dietaryTags */ }]
    }
  ]
  ```
- **Errors**: `500 { error: "Failed to load delivery dates" }`

---

## POST /api/mobile/native/auth/apple

- **Method**: POST
- **Auth**: none (this IS the sign-in endpoint) — verifies an Apple identity token
- **Tenant scoping**: `getCurrentRestaurant()` from subdomain; issued JWT
  embeds `restaurantId` so subsequent requests are cross-tenant safe
- **Request body**:
  ```json
  { "identityToken": "<apple JWT>", "fullName": { "givenName": "...", "familyName": "..." } }
  ```
- **Success (200)**: `{ "token": "<90-day native JWT>" }`
- **Errors**:
  - `400 { error: "identityToken is required" }`
  - `400 { error: "No email in Apple token" }`
  - `400 { error: "Sign-in must hit a restaurant subdomain..." }`
  - `401 { error: "Invalid identity token" }`
  - `500 { error: "Internal server error" }`

---

## GET /api/mobile/native/account

- **Method**: GET
- **Auth**: Bearer JWT required (`requireMobileAuth`)
- **Tenant scoping**: enforced by `requireMobileAuth` — the JWT's `restaurantId`
  must match the tenant resolved from the request host
- **Request**: no body
- **Success (200)**:
  ```json
  {
    "id": "...", "email": "...", "name": "...|null",
    "children": [
      {
        "id": "...", "schoolId": "...", "schoolName": "...",
        "locationType": "...", "studentName": "...", "grade": "...",
        "allergyNotes": ""
      }
    ]
  }
  ```
- **Errors**: `401` (unauthorized), `404 { error: "Parent not found" }`,
  `500 { error: "<message>" }`

## DELETE /api/mobile/native/account

- **Method**: DELETE
- **Auth**: Bearer JWT required
- **Tenant scoping**: enforced by JWT tenant check
- **Behavior**: hard-deletes the parent's `WeeklyCheckoutBatchItem`,
  `WeeklyCheckoutBatch`, `WeeklyLunchPlan`, `ParentChild`, and `ParentUser`
  rows in one transaction. Paid `Order` rows are retained (financial records);
  their `parentUserId` / `parentChildId` FKs `SetNull`.
- **Success (200)**: `{ "ok": true }`
- **Errors**: `401`, `404 { error: "Parent not found" }`, `500`

---

## POST /api/mobile/native/account/children

- **Method**: POST
- **Auth**: Bearer JWT required
- **Tenant scoping**: JWT tenant check; the created `ParentChild` inherits the
  parent's tenant via `parentUserId` — `schoolId` is trusted from the client
- **Request body**:
  ```json
  { "schoolId": "...", "studentName": "...", "grade": "...", "allergyNotes": "..." }
  ```
- **Success (201)**: created child, same shape as one entry in `account.children`
- **Errors**:
  - `400 { error: "schoolId and studentName are required" }`
  - `401`, `500`

## PATCH /api/mobile/native/account/children/[id]

- **Method**: PATCH
- **Auth**: Bearer JWT required (`requireMobileAuth`)
- **Tenant scoping**: JWT tenant check + child must belong to `parentUserId` + child's school must belong to the resolved tenant
- **Request body**: `{ studentName: string (required), schoolId?: string, grade?: string, allergyNotes?: string }` — only supplied fields are updated
- **Behavior**: updates the named fields on a non-archived child. Archived or missing children return 404.
- **Success (200)**: updated child (same shape as POST /account/children 201 response)
- **Errors**: `400 { "error": "studentName is required" }`, `401`, `404 { "error": "Child not found." }`, `500`

## DELETE /api/mobile/native/account/children/[id]

- **Method**: DELETE
- **Auth**: Bearer JWT required (`requireMobileAuth`)
- **Tenant scoping**: JWT tenant check + child ownership
- **Request**: path param `id`; no body
- **Behavior**: soft-deletes the child (sets `archivedAt`) and cascade-deletes all `WeeklyLunchPlan` rows for that child in a single transaction. No 409 — weekly plans are always cleared.
- **Success (200)**: `{ "ok": true }`
- **Errors**: `401`, `404 { "error": "Child not found." }`, `500`

---

## GET /api/mobile/native/weekly-plans

- **Method**: GET
- **Auth**: Bearer JWT required
- **Tenant scoping**: JWT tenant check; menu / delivery-date results are
  scoped to the parent's children's schools
- **Request**: no body
- **Success (200)**:
  ```json
  {
    "children":     [{ "id": "...", "schoolId": "...", "schoolName": "...", "locationType": "...", "studentName": "...", "grade": "..." }],
    "deliveryDates":[{ "id": "...", "schoolId": "...", "deliveryDate": "ISO", "cutoffAt": "ISO", "school": {...}, "menuItems": [...] }],
    "plans":        [{ "id": "...", "parentChildId": "...", "weekday": 1, "menuItemId": "...", "menuItemName": "...", "choice": "...|null", "size": "...|null", "additions": [], "removals": [], "isActive": true }]
  }
  ```
- **Errors**: `401`, `404 { error: "Parent not found" }`, `500`

## POST /api/mobile/native/weekly-plans

- **Method**: POST
- **Auth**: Bearer JWT required
- **Tenant scoping**: JWT tenant check + ownership check (child must belong to
  the calling parent) + menu-item must be active
- **Request body**:
  ```json
  {
    "parentChildId": "...", "weekday": 1-7, "menuItemId": "...",
    "choice": "?", "size": "?", "additions": ["?"], "removals": ["?"]
  }
  ```
- **Behavior**: creates a new `WeeklyLunchPlan` row. Multiple plans per
  `(parentChild, weekday)` are allowed — client removes via DELETE to change.
- **Success (200)**: created plan (same shape as one `plans[]` entry)
- **Errors**:
  - `400 { error: "parentChildId, menuItemId, and weekday (1-7) are required" }`
  - `404 { error: "Child not found on your account" }`
  - `404 { error: "Menu item not available" }`
  - `401`, `500`

---

## DELETE /api/mobile/native/weekly-plans/[id]

- **Method**: DELETE
- **Auth**: Bearer JWT required
- **Tenant scoping**: JWT tenant check + ownership (plan's `parentUserId` must
  equal the caller)
- **Request**: path param `id`
- **Success (200)**: `{ "ok": true }`
- **Errors**: `401`, `404 { error: "Plan not found" }`, `500`

---

## POST /api/mobile/native/weekly-checkout

- **Method**: POST
- **Auth**: Bearer JWT required
- **Tenant scoping**: JWT tenant check; the created `WeeklyCheckoutBatch`
  resolves its `restaurantId` from the parent's saved plans
- **Request body**: none (uses the parent's stored `WeeklyLunchPlan` rows)
- **Behavior**: builds a `WeeklyCheckoutBatch`, creates a Stripe Checkout
  session (routed to the restaurant's connected Stripe account when
  onboarded), stores `checkoutSessionId` on the batch, returns the URL.
- **Success (200)**:
  ```json
  { "checkoutUrl": "https://checkout.stripe.com/...", "batchId": "...", "totalCents": 0 }
  ```
- **Errors**:
  - `500 { error: "Stripe is not configured." }`
  - `400 { error: "<message from createWeeklyCheckoutBatch>" }`
  - `401`

---

## POST /api/mobile/native/order

- **Method**: POST
- **Auth**: Bearer JWT **optional** — guest checkout is supported. When
  present, `parentUserId` is attached to the order and the duplicate-order
  guard runs.
- **Tenant scoping**: `requireRestaurant()` from subdomain; when a Bearer
  token is provided, `getMobileAuth` also enforces the JWT tenant check
- **Request body**:
  ```json
  {
    "deliveryDateId": "...", "schoolId": "...",
    "studentName": "...", "grade": "...",
    "parentName": "...", "parentEmail": "...",
    "allergyNotes": "?", "specialInstructions": "?",
    "discountCode": "?",
    "items": [{ "menuItemId": "...", "choice": "?", "size": "?", "additions": ["?"], "removals": ["?"] }]
  }
  ```
- **Success (200)**: `{ "checkoutUrl": "https://checkout.stripe.com/...", "orderId": "..." }`
- **Errors**:
  - `400 { error: "Missing required fields" }`
  - `503 { error: "This operator isn't accepting payments yet." }` (Stripe not onboarded)
  - `429 { error: "You already have a pending order for this date." }` (duplicate within 5min)
  - `500 { error: "Stripe is not configured" }`
  - `400 { error: "<createPendingOrder message>" }`

---

## GET /api/mobile/native/order/success

- **Method**: GET
- **Auth**: none
- **Tenant scoping**: none — pure redirect handler
- **Request**: query `?orderId=<id>`
- **Behavior**: `302` redirect to `lunchpad://checkout/success?orderId=<id>`
  so the RN app's `openAuthSession` dismisses the Safari view
- **Errors**: n/a (always redirects)

## GET /api/mobile/native/order/cancel

- **Method**: GET
- **Auth**: none
- **Tenant scoping**: none — pure redirect handler
- **Request**: query `?orderId=<id>`
- **Behavior**: `302` redirect to `lunchpad://checkout/cancel?orderId=<id>`
- **Errors**: n/a (always redirects)

---

## GET /api/mobile/native/orders

- **Method**: GET
- **Auth**: Bearer JWT required
- **Tenant scoping**: JWT tenant check; results are filtered by
  `parentUserId` (order rows are already tenant-scoped by the parent's tenant)
- **Request**: no body
- **Behavior**: returns up to 50 most-recent `PAID` / `PENDING`, non-archived
  orders for the calling parent
- **Success (200)**:
  ```json
  [
    {
      "id": "...", "orderNumber": "...", "status": "PAID|PENDING",
      "deliveryDate": "ISO", "schoolName": "...",
      "totalCents": 0, "createdAt": "ISO",
      "items": [{ "name": "...", "lineTotalCents": 0, "additions": [], "removals": [] }]
    }
  ]
  ```
- **Errors**: `401`, `500`

---

## PATCH /api/mobile/native/orders/[orderId]

Modify a PAID order before its delivery cutoff.

- **Method**: PATCH
- **Auth**: Bearer JWT required (`requireMobileAuth`)
- **Tenant scoping**: JWT `restaurantId` must match the request host; additionally the order must belong to the JWT's `parentUserId`

**Request body** (JSON, all fields optional):

| Field | Type | Description |
|---|---|---|
| `additions` | `string[]` | Add-on option names to select |
| `removals` | `string[]` | Removal option names to select |
| `allergyNotes` | `string` | Updated allergy notes |
| `dietaryNotes` | `string` | Updated dietary notes |
| `specialInstructions` | `string` | Order-level special instructions |
| `teacherName` | `string` | Student's teacher name |
| `classroom` | `string` | Student's classroom |

**Response — order updated (200):**
```json
{ "action": "updated", "order": { "id": "...", "orderNumber": "...", "restaurantId": "..." } }
```

**Response — delta payment required (200):**
```json
{ "action": "checkout_required", "checkoutUrl": "https://checkout.stripe.com/..." }
```
The client should open `checkoutUrl` in a browser or in-app web view. The order's items are NOT updated until the payment completes via the Stripe webhook.

**Errors:**

| Status | Condition |
|---|---|
| `401` | Missing or invalid Bearer token |
| `403` | Order belongs to a different parent |
| `404` | Order not found (or belongs to a different tenant) |
| `409` | Order not in PAID status / pending edit already in flight / one-edit limit reached |
| `422` | Past delivery cutoff / too close to cutoff (<30 min) / invalid add-on or removal |

---

## DELETE /api/mobile/native/orders/[orderId]

- **Method**: DELETE
- **Auth**: Bearer JWT required (`requireMobileAuth`)
- **Tenant scoping**: JWT `restaurantId` must match the request host (enforced by
  `requireMobileAuth`); additionally the order must belong to the JWT's `parentUserId`
  and the resolved tenant.
- **Request**: path param `orderId`; no body
- **Behavior**: cancels a PAID order before its delivery cutoff. Issues a full Stripe
  refund via `cancelOrderWithRefund` (same path as the web cancel flow). Sends a
  best-effort cancellation email to the parent.
- **Success (200)**: `{ "ok": true }`
- **Errors**:
  - `401` — missing or invalid Bearer token
  - `403 { "error": "Not your order." }` — order exists but belongs to a different parent
  - `404 { "error": "Order not found." }` — no order with this ID in this tenant
  - `409 { "error": "Only paid orders can be cancelled." }` — order not in PAID status
  - `422 { "error": "<cutoff message>" }` — past the delivery cutoff
  - `500 { "error": "Failed to cancel order." }` — unexpected server error
