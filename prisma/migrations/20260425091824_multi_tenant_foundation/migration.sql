/*
  Warnings:

  - The `role` column on the `AdminUser` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[restaurantId,email]` on the table `AdminUser` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[restaurantId,slug]` on the table `MenuItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[restaurantId,slug]` on the table `School` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `restaurantId` to the `AdminUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `restaurantId` to the `MenuItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `restaurantId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `restaurantId` to the `School` table without a default value. This is not possible if the table is not empty.
  - Added the required column `restaurantId` to the `WeeklyCheckoutBatch` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "RestaurantPlan" AS ENUM ('FREE', 'STARTER', 'PRO');

-- DropIndex
-- Fixed 2026-07-21: the original `DROP INDEX` fails on a fresh shadow-database
-- replay because AdminUser_email_key is registered as a table constraint there
-- (not a bare index) — Postgres requires dropping the constraint, which
-- cascades to remove its backing index. This already succeeded historically
-- against the real database under the old syntax; this fix only matters for
-- fresh replays (shadow DB, new dev environments, CI).
ALTER TABLE "AdminUser" DROP CONSTRAINT "AdminUser_email_key";

-- DropIndex
-- Fixed 2026-07-21: same constraint-vs-index issue as AdminUser_email_key above.
ALTER TABLE "MenuItem" DROP CONSTRAINT "MenuItem_slug_key";

-- DropIndex
-- Fixed 2026-07-21: same constraint-vs-index issue as AdminUser_email_key above.
ALTER TABLE "School" DROP CONSTRAINT "School_slug_key";

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "restaurantId" TEXT NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "restaurantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "restaurantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN     "restaurantId" TEXT;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "restaurantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WeeklyCheckoutBatch" ADD COLUMN     "restaurantId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "logoUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#c41230',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stripeAccountId" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "plan" "RestaurantPlan" NOT NULL DEFAULT 'FREE',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_stripeAccountId_key" ON "Restaurant"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_restaurantId_email_key" ON "AdminUser"("restaurantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_restaurantId_slug_key" ON "MenuItem"("restaurantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "School_restaurantId_slug_key" ON "School"("restaurantId", "slug");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckoutBatch" ADD CONSTRAINT "WeeklyCheckoutBatch_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedWebhookEvent" ADD CONSTRAINT "ProcessedWebhookEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
