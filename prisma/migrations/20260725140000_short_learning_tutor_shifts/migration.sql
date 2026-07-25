-- Additive migration: Short Learning, tutor shifts, booking windows.
-- No DROP TABLE / DROP COLUMN / truncate / data wipe.

-- AlterTable
ALTER TABLE "SchoolSupportPolicy" ADD COLUMN IF NOT EXISTS "shiftEndGraceMinutes" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "SchoolSupportPolicy" ADD COLUMN IF NOT EXISTS "metadataJson" TEXT;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TutorSupportShiftStatus" AS ENUM ('scheduled', 'on_shift', 'break', 'finished', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StudentLearningBookingStatus" AS ENUM ('booked', 'confirmed', 'attended', 'completed', 'cancelled', 'late_cancelled', 'no_show', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TutorSupportShift" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolTeacherId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "breakStartsAt" TIMESTAMP(3),
    "breakEndsAt" TIMESTAMP(3),
    "status" "TutorSupportShiftStatus" NOT NULL DEFAULT 'scheduled',
    "yearGroupScopeJson" TEXT,
    "subjectScopeJson" TEXT,
    "notes" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdByTeacherId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TutorSupportShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SchoolLearningWindow" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "weekday" INTEGER,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "allowedDurationsJson" TEXT NOT NULL DEFAULT '[90,120]',
    "startIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "capacityPerSlot" INTEGER NOT NULL DEFAULT 40,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolLearningWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudentLearningBooking" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolStudentId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "learningWindowId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "learningFocus" TEXT,
    "parentNote" TEXT,
    "status" "StudentLearningBookingStatus" NOT NULL DEFAULT 'booked',
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationCategory" TEXT,
    "joinedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'parent_portal',
    "honestyPolicyVersion" TEXT,
    "honestyAcknowledgedAt" TIMESTAMP(3),
    "subscriptionSnapshotJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentLearningBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TutorSupportShift_schoolId_startsAt_endsAt_idx" ON "TutorSupportShift"("schoolId", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "TutorSupportShift_schoolTeacherId_startsAt_idx" ON "TutorSupportShift"("schoolTeacherId", "startsAt");
CREATE INDEX IF NOT EXISTS "TutorSupportShift_schoolId_status_startsAt_idx" ON "TutorSupportShift"("schoolId", "status", "startsAt");
CREATE INDEX IF NOT EXISTS "SchoolLearningWindow_schoolId_active_weekday_idx" ON "SchoolLearningWindow"("schoolId", "active", "weekday");
CREATE INDEX IF NOT EXISTS "SchoolLearningWindow_schoolId_effectiveFrom_effectiveTo_idx" ON "SchoolLearningWindow"("schoolId", "effectiveFrom", "effectiveTo");
CREATE INDEX IF NOT EXISTS "StudentLearningBooking_schoolId_startsAt_idx" ON "StudentLearningBooking"("schoolId", "startsAt");
CREATE INDEX IF NOT EXISTS "StudentLearningBooking_schoolStudentId_startsAt_idx" ON "StudentLearningBooking"("schoolStudentId", "startsAt");
CREATE INDEX IF NOT EXISTS "StudentLearningBooking_parentUserId_startsAt_idx" ON "StudentLearningBooking"("parentUserId", "startsAt");
CREATE INDEX IF NOT EXISTS "StudentLearningBooking_schoolId_status_startsAt_idx" ON "StudentLearningBooking"("schoolId", "status", "startsAt");
CREATE INDEX IF NOT EXISTS "StudentLearningBooking_learningWindowId_idx" ON "StudentLearningBooking"("learningWindowId");

-- AddForeignKey (idempotent-ish via exception handling)
DO $$ BEGIN
  ALTER TABLE "TutorSupportShift" ADD CONSTRAINT "TutorSupportShift_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TutorSupportShift" ADD CONSTRAINT "TutorSupportShift_schoolTeacherId_fkey" FOREIGN KEY ("schoolTeacherId") REFERENCES "SchoolTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TutorSupportShift" ADD CONSTRAINT "TutorSupportShift_createdByTeacherId_fkey" FOREIGN KEY ("createdByTeacherId") REFERENCES "SchoolTeacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SchoolLearningWindow" ADD CONSTRAINT "SchoolLearningWindow_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StudentLearningBooking" ADD CONSTRAINT "StudentLearningBooking_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StudentLearningBooking" ADD CONSTRAINT "StudentLearningBooking_schoolStudentId_fkey" FOREIGN KEY ("schoolStudentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StudentLearningBooking" ADD CONSTRAINT "StudentLearningBooking_learningWindowId_fkey" FOREIGN KEY ("learningWindowId") REFERENCES "SchoolLearningWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
