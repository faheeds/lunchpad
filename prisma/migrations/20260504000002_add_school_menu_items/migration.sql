-- CreateTable
CREATE TABLE "SchoolMenuItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMenuItem_schoolId_menuItemId_key" ON "SchoolMenuItem"("schoolId", "menuItemId");

-- AddForeignKey
ALTER TABLE "SchoolMenuItem" ADD CONSTRAINT "SchoolMenuItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMenuItem" ADD CONSTRAINT "SchoolMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
