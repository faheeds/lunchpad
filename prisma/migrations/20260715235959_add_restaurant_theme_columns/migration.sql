-- Backfills a migration file for columns that were added directly to
-- production out-of-band (no ADD COLUMN migration was ever committed for
-- them), discovered 2026-07-21 while investigating why `prisma migrate dev`
-- fails to replay history on a fresh shadow database: the later
-- 20260716000000_editorial_theme_defaults migration sets column defaults
-- on columns that, on a from-scratch replay, don't exist yet.
--
-- Nullable, no defaults here on purpose — 20260716000000_editorial_theme_defaults
-- (which already exists) is what sets the defaults, immediately after this.
-- primaryColor already exists (added by 20260425091824_multi_tenant_foundation
-- with the legacy '#c41230' default) — only the other four are missing.
ALTER TABLE "Restaurant" ADD COLUMN "accentColor" TEXT,
ADD COLUMN "darkColor" TEXT,
ADD COLUMN "bodyTextColor" TEXT,
ADD COLUMN "displayFont" TEXT;
