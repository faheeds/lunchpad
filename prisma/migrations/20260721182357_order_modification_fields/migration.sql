-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deltaAmountCents" INTEGER,
ADD COLUMN     "deltaPaymentIntentId" TEXT,
ADD COLUMN     "pendingEditCheckoutSession" TEXT,
ADD COLUMN     "pendingEditCreatedAt" TIMESTAMP(3),
ADD COLUMN     "pendingEditTotalCents" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Order_pendingEditCheckoutSession_key" ON "Order"("pendingEditCheckoutSession");
