-- Lets operators explicitly choose which menu items appear in the
-- storefront homepage's "This Week's Menu" grid/carousel, instead of the
-- automatic keyword-based pick. Defaults to false so existing tenants keep
-- their current homepage behavior until they opt items in.

ALTER TABLE "MenuItem" ADD COLUMN "featuredOnLanding" BOOLEAN NOT NULL DEFAULT false;
