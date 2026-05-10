-- Migration: scope ParentUser per-tenant
--
-- Run this BEFORE `prisma db push` against production. The order matters:
-- the new schema requires ParentUser.restaurantId NOT NULL, so we have to
-- add the column nullable, backfill it, then let Prisma flip it to NOT NULL
-- and add the composite unique index.
--
-- Steps:
--   1. Add nullable restaurantId column
--   2. Backfill from each parent's first child's school's restaurant
--   3. Backfill any remaining rows from their oldest order's restaurant
--   4. Delete orphan parents (no children, no orders — these are dead OAuth records
--      that can't be tied to a restaurant)
--   5. Drop the old single-column email unique constraint
--
-- After this completes, run `npx prisma db push` to apply the rest of the
-- schema changes (NOT NULL on restaurantId, composite unique on
-- (restaurantId, email), email index, FK to Restaurant).

BEGIN;

-- 1. Add nullable column
ALTER TABLE "ParentUser" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;

-- 2. Backfill from first child
UPDATE "ParentUser" pu
SET "restaurantId" = (
  SELECT s."restaurantId"
  FROM "ParentChild" pc
  JOIN "School" s ON pc."schoolId" = s.id
  WHERE pc."parentUserId" = pu.id
  ORDER BY pc."createdAt" ASC
  LIMIT 1
)
WHERE pu."restaurantId" IS NULL;

-- 3. Backfill remaining from oldest order
UPDATE "ParentUser" pu
SET "restaurantId" = (
  SELECT o."restaurantId"
  FROM "Order" o
  WHERE o."parentUserId" = pu.id
  ORDER BY o."createdAt" ASC
  LIMIT 1
)
WHERE pu."restaurantId" IS NULL;

-- 4. Delete orphans (no children, no orders, no tenant context)
DELETE FROM "ParentUser" WHERE "restaurantId" IS NULL;

-- 5. Drop old email-only unique constraint (Prisma named it "ParentUser_email_key")
ALTER TABLE "ParentUser" DROP CONSTRAINT IF EXISTS "ParentUser_email_key";

COMMIT;

-- Verify before continuing — every parent should now have a restaurantId.
-- Expected: 0 rows.
SELECT id, email FROM "ParentUser" WHERE "restaurantId" IS NULL;
