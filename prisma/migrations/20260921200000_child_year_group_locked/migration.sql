-- Admin/school override: when true, year group is not auto-derived from date of birth.
ALTER TABLE "ChildProfile" ADD COLUMN IF NOT EXISTS "yearGroupLocked" BOOLEAN NOT NULL DEFAULT false;