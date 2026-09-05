-- Adds a per-school grades list. Existing schools are backfilled using
-- the exact same name-matching logic the app currently uses at runtime
-- (components/forms/grade-select.tsx, components/forms/order-form.tsx),
-- so this migration changes zero user-visible behavior for any existing
-- school -- it just moves the same effective list from hardcoded app
-- logic into real, editable per-school data. New schools created after
-- this migration get an empty array, which the app falls back to a
-- generic K-12 list for (lib/grades.ts's STANDARD_GRADES), not the old
-- Bellevue/Redmond-specific ones.

ALTER TABLE "School" ADD COLUMN "grades" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "School"
SET "grades" = CASE
  WHEN "name" ILIKE '%bellevue%' THEN
    ARRAY['KG Blue','KG Green','1 Green','1 Blue','2 Green','2 Blue','3 Green','3 Blue','Other']
  WHEN "name" ILIKE '%redmond%' THEN
    ARRAY['4 Blue','4 Green','5 Blue','5 Green','6','7','8','9','10','Other']
  ELSE
    ARRAY['KG Blue','KG Green','1 Green','1 Blue','2 Green','2 Blue','3 Green','3 Blue','4 Blue','4 Green','5 Blue','5 Green','6','7','8','9','10','Other']
END
WHERE "locationType" = 'SCHOOL';
