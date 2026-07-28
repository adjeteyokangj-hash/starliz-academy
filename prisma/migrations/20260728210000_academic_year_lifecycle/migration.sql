-- Academic year lifecycle (additive only; no destructive changes).

CREATE TABLE IF NOT EXISTS "SchoolAcademicYearConfig" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "currentAcademicYear" TEXT NOT NULL,
  "nextAcademicYear" TEXT NOT NULL,
  "promotionDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "appliedAt" TIMESTAMP(3),
  "appliedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolAcademicYearConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAcademicYearConfig_schoolId_key" ON "SchoolAcademicYearConfig"("schoolId");
CREATE INDEX IF NOT EXISTS "SchoolAcademicYearConfig_status_promotionDate_idx" ON "SchoolAcademicYearConfig"("status", "promotionDate");

DO $$ BEGIN
  ALTER TABLE "SchoolAcademicYearConfig"
    ADD CONSTRAINT "SchoolAcademicYearConfig_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StudentYearChange" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "schoolStudentId" TEXT,
  "fromYearGroup" TEXT,
  "toYearGroup" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "academicYearFrom" TEXT,
  "academicYearTo" TEXT,
  "actorUserId" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentYearChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudentYearChange_schoolId_createdAt_idx" ON "StudentYearChange"("schoolId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentYearChange_childId_createdAt_idx" ON "StudentYearChange"("childId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentYearChange_schoolStudentId_idx" ON "StudentYearChange"("schoolStudentId");

DO $$ BEGIN
  ALTER TABLE "StudentYearChange"
    ADD CONSTRAINT "StudentYearChange_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StudentYearChange"
    ADD CONSTRAINT "StudentYearChange_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StudentYearChange"
    ADD CONSTRAINT "StudentYearChange_schoolStudentId_fkey"
    FOREIGN KEY ("schoolStudentId") REFERENCES "SchoolStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SchoolStudent" ADD COLUMN IF NOT EXISTS "holdBackFromPromotion" BOOLEAN NOT NULL DEFAULT false;