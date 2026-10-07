-- Multi-day (weekly streak) discounts: per-restaurant tier table stored on the
-- Discount row, plus a template kind to drive the admin builder.
ALTER TYPE "DiscountTemplate" ADD VALUE IF NOT EXISTS 'MULTI_DAY';
ALTER TABLE "Discount" ADD COLUMN IF NOT EXISTS "weeklyTiers" JSONB;
