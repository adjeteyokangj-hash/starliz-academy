-- Additive StaffAbsence for School Portal ops (no destructive changes).
CREATE TABLE IF NOT EXISTS "StaffAbsence" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "schoolTeacherId" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffAbsence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StaffAbsence_schoolId_startsOn_endsOn_idx" ON "StaffAbsence"("schoolId", "startsOn", "endsOn");
CREATE INDEX IF NOT EXISTS "StaffAbsence_schoolTeacherId_startsOn_idx" ON "StaffAbsence"("schoolTeacherId", "startsOn");

DO $$ BEGIN
  ALTER TABLE "StaffAbsence"
    ADD CONSTRAINT "StaffAbsence_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StaffAbsence"
    ADD CONSTRAINT "StaffAbsence_schoolTeacherId_fkey"
    FOREIGN KEY ("schoolTeacherId") REFERENCES "SchoolTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
