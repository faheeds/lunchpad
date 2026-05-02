-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'PAUSED');

-- AlterEnum: add GROWTH and SCALE to RestaurantPlan (rename PRO -> GROWTH)
ALTER TYPE "RestaurantPlan" ADD VALUE 'GROWTH';
ALTER TYPE "RestaurantPlan" ADD VALUE 'SCALE';

-- AlterTable: add subscription columns to Restaurant
ALTER TABLE "Restaurant"
  ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "stripeCustomerId"   TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_stripeCustomerId_key" ON "Restaurant"("stripeCustomerId");
CREATE UNIQUE INDEX "Restaurant_stripeSubscriptionId_key" ON "Restaurant"("stripeSubscriptionId");
