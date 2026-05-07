# Multi-tenant query rules — READ BEFORE ADDING PRISMA QUERIES

LunchPad is multi-tenant. Each `Restaurant` is a tenant. Almost every model
descends from a `Restaurant`. Forgetting to scope a query by tenant means
one restaurant's data leaks into another restaurant's UI.

## Models and how they're tenant-scoped

| Model | Scoping field |
|---|---|
| `AdminUser` | direct `restaurantId` |
| `School` | direct `restaurantId` |
| `MenuItem` | direct `restaurantId` |
| `Order` | direct `restaurantId` |
| `WeeklyCheckoutBatch` | direct `restaurantId` |
| `DeliveryDate` | via `school.restaurantId` |
| `Student` | via `school.restaurantId` |
| `ParentChild` | via `school.restaurantId` |
| `DeliveryMenuItem` | via `school.restaurantId` (or `menuItem.restaurantId`) |
| `MenuOption` | via `menuItem.restaurantId` |
| `OrderItem` | via `order.restaurantId` |
| `SchoolMenuItem` | via `school.restaurantId` |
| `WeeklyLunchPlan` | via `school.restaurantId` |
| `WeeklyCheckoutBatchItem` | via `batch.restaurantId` |

## Models that are intentionally cross-tenant

- `Restaurant` — the root, no scoping needed
- `ParentUser` — global; one account works across restaurants
- `ProcessedWebhookEvent` — keyed at write-time

## Required pattern for tenant-scoped queries

Always include `restaurantId` (direct) or the equivalent relation filter:

```ts
// Direct
await prisma.menuItem.findMany({
  where: { restaurantId: restaurant.id, isActive: true },
});

// Via relation
await prisma.deliveryDate.findMany({
  where: { school: { restaurantId: restaurant.id } },
});
```

For `findUnique` / `findFirst` by ID where the ID came from user input (URL,
form, body), use `findFirst` with both the ID and the tenant filter:

```ts
const order = await prisma.order.findFirst({
  where: { id: orderId, restaurantId: restaurant.id },
});
```

`findUnique` won't accept compound where clauses, so use `findFirst` for
this pattern. Verify result is non-null before trusting it.

## Required pattern for service-layer functions

Any function that accepts an `orderId` / `schoolId` / etc. as a parameter
and queries on it MUST also accept `restaurantId` as a parameter and use
both in the `where` clause. Example:

```ts
// BAD — caller can pass any orderId from any restaurant
export async function setOrderStatus(orderId: string, status: OrderStatus) {
  return prisma.order.update({ where: { id: orderId }, data: { status } });
}

// GOOD — scoped to a single restaurant
export async function setOrderStatus(
  restaurantId: string,
  orderId: string,
  status: OrderStatus
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found in this restaurant.`);
  return prisma.order.update({ where: { id: orderId }, data: { status } });
}
```

## Where to get the tenant ID

- Public-facing pages (`app/page.tsx`, `app/(marketing)/*`): `await getCurrentRestaurant()`. Returns `null` on the platform landing — handle that.
- Admin pages (`app/admin/(protected)/*`): `await requireRestaurant()`. Throws if no tenant context.
- Admin API routes: `const { restaurantId } = await assertAdminApiRequest();`
- Stripe webhooks: get `restaurantId` from the loaded Order (orders have direct `restaurantId`).

## Lint check

The script at `scripts/audit-tenant-scoping.ts` greps the codebase for
`prisma.<TenantScopedModel>.<finder>` calls and fails if any are missing
a tenant filter. Run before pushing:

```bash
npm run audit:tenancy
```

Add new tenant-scoped models to the list at the top of the script.
