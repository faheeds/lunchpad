-- Size selection for weekly lunch plans and their checkout batch items.
-- Mirrors the size-based pricing already present on OrderItem.sizeName.
ALTER TABLE "WeeklyLunchPlan" ADD COLUMN "size" TEXT;
ALTER TABLE "WeeklyCheckoutBatchItem" ADD COLUMN "size" TEXT;
