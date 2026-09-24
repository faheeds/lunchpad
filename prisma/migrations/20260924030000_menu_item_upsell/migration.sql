-- Marks which menu items are eligible for the iOS cart's one-tap "Add a
-- little something?" upsell rail. Defaults to false so no existing items
-- start appearing there; operators opt individual items in from the admin
-- menu editor.

ALTER TABLE "MenuItem" ADD COLUMN "isUpsell" BOOLEAN NOT NULL DEFAULT false;
