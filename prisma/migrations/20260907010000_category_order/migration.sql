-- Adds a small per-restaurant table mapping menu category names to a
-- display sort position. Categories themselves remain plain strings on
-- MenuItem (unchanged) -- this table is purely additive and empty by
-- default, so every category falls back to alphabetical ordering
-- (existing behavior) until an operator explicitly sets an order via
-- the admin Menu page's "Manage categories" panel.

CREATE TABLE "CategoryOrder" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryOrder_restaurantId_name_key" ON "CategoryOrder"("restaurantId", "name");

ALTER TABLE "CategoryOrder" ADD CONSTRAINT "CategoryOrder_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
