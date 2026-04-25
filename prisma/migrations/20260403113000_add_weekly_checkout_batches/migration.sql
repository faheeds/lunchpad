CREATE TYPE "WeeklyCheckoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TABLE "WeeklyCheckoutBatch" (
  "id" TEXT NOT NULL,
  "parentUserId" TEXT NOT NULL,
  "status" "WeeklyCheckoutStatus" NOT NULL DEFAULT 'PENDING',
  "checkoutSessionId" TEXT,
  "paymentIntentId" TEXT,
  "totalCents" INTEGER NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyCheckoutBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyCheckoutBatch_checkoutSessionId_key" ON "WeeklyCheckoutBatch"("checkoutSessionId");
CREATE UNIQUE INDEX "WeeklyCheckoutBatch_paymentIntentId_key" ON "WeeklyCheckoutBatch"("paymentIntentId");

CREATE TABLE "WeeklyCheckoutBatchItem" (
  "id" TEXT NOT NULL,
  "weeklyCheckoutBatchId" TEXT NOT NULL,
  "parentChildId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deliveryDateId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "choice" TEXT,
  "additions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "removals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "itemNameSnapshot" TEXT NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "lineTotalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyCheckoutBatchItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WeeklyCheckoutBatch"
ADD CONSTRAINT "WeeklyCheckoutBatch_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyCheckoutBatchItem"
ADD CONSTRAINT "WeeklyCheckoutBatchItem_weeklyCheckoutBatchId_fkey" FOREIGN KEY ("weeklyCheckoutBatchId") REFERENCES "WeeklyCheckoutBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyCheckoutBatchItem"
ADD CONSTRAINT "WeeklyCheckoutBatchItem_parentChildId_fkey" FOREIGN KEY ("parentChildId") REFERENCES "ParentChild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyCheckoutBatchItem"
ADD CONSTRAINT "WeeklyCheckoutBatchItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyCheckoutBatchItem"
ADD CONSTRAINT "WeeklyCheckoutBatchItem_deliveryDateId_fkey" FOREIGN KEY ("deliveryDateId") REFERENCES "DeliveryDate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyCheckoutBatchItem"
ADD CONSTRAINT "WeeklyCheckoutBatchItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
