-- Change Restaurant model's default theme from the legacy Local Bigger
-- Burger crimson palette to LunchPad's own editorial theme. This only
-- changes the DEFAULT applied to future INSERTs where these columns are
-- omitted — it does NOT modify any existing row. Existing tenants keep
-- whatever theme values they already have, customized or not.

ALTER TABLE "Restaurant" ALTER COLUMN "primaryColor" SET DEFAULT '#2C4031';
ALTER TABLE "Restaurant" ALTER COLUMN "accentColor" SET DEFAULT '#C0673E';
ALTER TABLE "Restaurant" ALTER COLUMN "darkColor" SET DEFAULT '#1E2C22';
ALTER TABLE "Restaurant" ALTER COLUMN "bodyTextColor" SET DEFAULT '#211D15';
ALTER TABLE "Restaurant" ALTER COLUMN "displayFont" SET DEFAULT 'Fraunces';
