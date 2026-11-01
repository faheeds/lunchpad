-- Landing template selector + operator-authored landing copy.
-- Existing tenants stay on "classic"; nothing changes for them.
ALTER TABLE "Restaurant" ADD COLUMN "landingTemplate" TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE "Restaurant" ADD COLUMN "landingContent" JSONB;
