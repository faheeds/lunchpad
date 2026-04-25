CREATE TYPE "UserRole" AS ENUM ('ADMIN');
CREATE TYPE "MenuOptionType" AS ENUM ('ADD_ON', 'REMOVAL');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED');

CREATE TABLE "AdminUser" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "School" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  "defaultCutoffHour" INTEGER NOT NULL DEFAULT 17,
  "defaultCutoffMinute" INTEGER NOT NULL DEFAULT 0,
  "collectTeacher" BOOLEAN NOT NULL DEFAULT true,
  "collectClassroom" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "DeliveryDate" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE CASCADE,
  "deliveryDate" TIMESTAMP(3) NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "orderingOpen" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryDate_schoolId_deliveryDate_key" UNIQUE ("schoolId", "deliveryDate")
);

CREATE TABLE "MenuItem" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "basePriceCents" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "DeliveryMenuItem" (
  "id" TEXT PRIMARY KEY,
  "deliveryDateId" TEXT NOT NULL REFERENCES "DeliveryDate"("id") ON DELETE CASCADE,
  "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id") ON DELETE CASCADE,
  "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE CASCADE,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryMenuItem_deliveryDateId_menuItemId_key" UNIQUE ("deliveryDateId", "menuItemId")
);

CREATE TABLE "MenuOption" (
  "id" TEXT PRIMARY KEY,
  "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "optionType" "MenuOptionType" NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Student" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE RESTRICT,
  "studentName" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "teacherName" TEXT,
  "classroom" TEXT,
  "allergyNotes" TEXT,
  "dietaryNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "orderNumber" TEXT NOT NULL UNIQUE,
  "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE RESTRICT,
  "deliveryDateId" TEXT NOT NULL REFERENCES "DeliveryDate"("id") ON DELETE RESTRICT,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE RESTRICT,
  "parentName" TEXT NOT NULL,
  "parentEmail" TEXT NOT NULL,
  "specialInstructions" TEXT,
  "subtotalCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "confirmationSentAt" TIMESTAMP(3),
  "checkoutSessionId" TEXT UNIQUE,
  "paymentIntentId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "OrderItem" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "menuItemId" TEXT NOT NULL REFERENCES "MenuItem"("id") ON DELETE RESTRICT,
  "itemNameSnapshot" TEXT NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "additions" TEXT[] NOT NULL,
  "removals" TEXT[] NOT NULL,
  "allergyNotes" TEXT,
  "dietaryNotes" TEXT,
  "specialInstructions" TEXT,
  "lineTotalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "providerSessionId" TEXT UNIQUE,
  "providerPaymentIntent" TEXT UNIQUE,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "EmailLog" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "emailType" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "providerId" TEXT,
  "status" "EmailStatus" NOT NULL,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ProcessedWebhookEvent" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL UNIQUE,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
