-- Wires the discount engine into the weekly/ad-hoc batch checkout path
-- (lib/weekly-checkout.ts), which previously never applied any discount
-- (auto or promo code) at all — this is what the iOS app's multi-child
-- cart checkout and the web weekly-plan checkout both go through.
--
-- Discount is scored per WeeklyCheckoutBatchItem (per child), not once
-- for the whole batch, because eligibility genuinely differs child to
-- child within one cart (e.g. firstOrderOnly). WeeklyCheckoutBatch gets
-- an aggregate subtotalCents/discountCents split mirroring the Order
-- model's existing subtotalCents/discountCents/totalCents columns —
-- totalCents changes meaning here from "gross sum of items" (its only
-- possible value before this migration, since no discount ever applied)
-- to "actually charged" (net of discount), consistent with Order.
--
-- All new columns default to zero-impact values (0 / NULL) so existing
-- rows and any in-flight code paths that don't yet set them keep working
-- exactly as before.

ALTER TABLE "WeeklyCheckoutBatch" ADD COLUMN "subtotalCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WeeklyCheckoutBatch" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WeeklyCheckoutBatchItem" ADD COLUMN "discountId" TEXT;
ALTER TABLE "WeeklyCheckoutBatchItem" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "WeeklyCheckoutBatchItem_discountId_idx" ON "WeeklyCheckoutBatchItem"("discountId");

ALTER TABLE "WeeklyCheckoutBatchItem" ADD CONSTRAINT "WeeklyCheckoutBatchItem_discountId_fkey"
  FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
