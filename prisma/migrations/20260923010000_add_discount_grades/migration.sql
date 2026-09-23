-- Adds per-discount grade eligibility. Discount.grades holds a list of
-- Student/ParentChild.grade string values (the same free-text values
-- School.grades offers, e.g. "5th Grade" or an operator-added value like
-- "Teacher/Admin") that this discount is restricted to. Empty (the
-- default) = all grades, matching the existing schoolIds convention, so
-- this migration changes zero behavior for existing discounts.

ALTER TABLE "Discount" ADD COLUMN "grades" TEXT[] NOT NULL DEFAULT '{}';
