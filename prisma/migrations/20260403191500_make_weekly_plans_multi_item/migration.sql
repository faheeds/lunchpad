ALTER TABLE "WeeklyLunchPlan"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "WeeklyLunchPlan_parentChildId_weekday_key";

CREATE INDEX "WeeklyLunchPlan_parentChildId_weekday_sortOrder_idx"
ON "WeeklyLunchPlan"("parentChildId", "weekday", "sortOrder");
