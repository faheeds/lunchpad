-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushToken_parentUserId_idx" ON "PushToken"("parentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_parentUserId_token_key" ON "PushToken"("parentUserId", "token");

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
