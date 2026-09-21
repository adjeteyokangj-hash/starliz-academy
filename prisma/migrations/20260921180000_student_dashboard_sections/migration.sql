-- Additive: per-student Study Dashboard section visibility flags.
-- NULL / missing JSON means all gated sections stay hidden until admin enables them.

ALTER TABLE "StudentProfile" ADD COLUMN "dashboardSectionsJson" TEXT;
