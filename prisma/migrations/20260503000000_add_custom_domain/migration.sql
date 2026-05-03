-- AlterTable: add customDomain to Restaurant
ALTER TABLE "Restaurant" ADD COLUMN "customDomain" TEXT;

-- CreateIndex: unique constraint on customDomain
CREATE UNIQUE INDEX "Restaurant_customDomain_key" ON "Restaurant"("customDomain");
