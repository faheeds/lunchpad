ALTER TABLE "Order"
ADD COLUMN "parentUserId" TEXT,
ADD COLUMN "parentChildId" TEXT;

CREATE TABLE "ParentUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "image" TEXT,
  "provider" TEXT,
  "providerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParentUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParentUser_email_key" ON "ParentUser"("email");

CREATE TABLE "ParentChild" (
  "id" TEXT NOT NULL,
  "parentUserId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "teacherName" TEXT,
  "classroom" TEXT,
  "allergyNotes" TEXT,
  "dietaryNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParentChild_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyLunchPlan" (
  "id" TEXT NOT NULL,
  "parentUserId" TEXT NOT NULL,
  "parentChildId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "choice" TEXT,
  "additions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "removals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyLunchPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WeeklyLunchPlan_parentUserId_weekday_idx" ON "WeeklyLunchPlan"("parentUserId", "weekday");
CREATE UNIQUE INDEX "WeeklyLunchPlan_parentChildId_weekday_key" ON "WeeklyLunchPlan"("parentChildId", "weekday");

ALTER TABLE "ParentChild"
ADD CONSTRAINT "ParentChild_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ParentChild"
ADD CONSTRAINT "ParentChild_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyLunchPlan"
ADD CONSTRAINT "WeeklyLunchPlan_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyLunchPlan"
ADD CONSTRAINT "WeeklyLunchPlan_parentChildId_fkey" FOREIGN KEY ("parentChildId") REFERENCES "ParentChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyLunchPlan"
ADD CONSTRAINT "WeeklyLunchPlan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyLunchPlan"
ADD CONSTRAINT "WeeklyLunchPlan_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "ParentUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_parentChildId_fkey" FOREIGN KEY ("parentChildId") REFERENCES "ParentChild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
