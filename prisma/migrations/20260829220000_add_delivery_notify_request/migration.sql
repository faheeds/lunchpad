-- Email-capture waitlist for the "no upcoming delivery dates" empty state.
-- New table only -- no changes to any existing table, no data migration.

CREATE TABLE "DeliveryNotifyRequest" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryNotifyRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryNotifyRequest_restaurantId_email_key" ON "DeliveryNotifyRequest"("restaurantId", "email");

CREATE INDEX "DeliveryNotifyRequest_restaurantId_notifiedAt_idx" ON "DeliveryNotifyRequest"("restaurantId", "notifiedAt");

ALTER TABLE "DeliveryNotifyRequest" ADD CONSTRAINT "DeliveryNotifyRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
