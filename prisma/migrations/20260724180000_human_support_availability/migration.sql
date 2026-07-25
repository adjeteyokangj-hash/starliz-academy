-- Human Support Availability & Scheduling v1 (additive only)

CREATE TYPE "TutorAvailabilityStatus" AS ENUM ('offline', 'available', 'busy', 'paused');
CREATE TYPE "HumanSupportQueueStatus" AS ENUM ('waiting', 'assigned', 'in_session', 'completed', 'cancelled', 'paused_ai_only', 'recovered', 'expired');
CREATE TYPE "HumanSupportSessionStatus" AS ENUM ('active', 'completed', 'abandoned', 'timed_out', 'handed_over');
CREATE TYPE "HumanSupportOutcome" AS ENUM ('resolved', 'partially_resolved', 'unresolved', 'escalated', 'student_recovered', 'period_ended', 'disconnected');

CREATE TABLE "TutorPresence" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolTeacherId" TEXT NOT NULL,
    "status" "TutorAvailabilityStatus" NOT NULL DEFAULT 'offline',
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableSince" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "busySince" TIMESTAMP(3),
    "activeSessionId" TEXT,
    "dayLessonId" TEXT,
    "rollingMedianMinutes" DOUBLE PRECISION,
    "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "resolutionRate" DOUBLE PRECISION,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorPresence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HumanSupportQueueEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "classroomId" TEXT,
    "periodId" TEXT,
    "assignmentId" TEXT,
    "questionKey" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "HumanSupportQueueStatus" NOT NULL DEFAULT 'waiting',
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "assignedTutorId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "estimatedWaitSec" INTEGER,
    "budgetMinutes" INTEGER,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanSupportQueueEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HumanSupportSession" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "queueEntryId" TEXT NOT NULL,
    "schoolTeacherId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "periodId" TEXT,
    "budgetMinutes" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannedEndsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "extendedAt" TIMESTAMP(3),
    "status" "HumanSupportSessionStatus" NOT NULL DEFAULT 'active',
    "outcome" "HumanSupportOutcome",
    "outcomeNotes" TEXT,
    "unresolvedReportJson" TEXT,
    "exceededBudget" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanSupportSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolSupportPolicy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "minimumSessionMinutes" INTEGER NOT NULL DEFAULT 5,
    "maximumSessionMinutes" INTEGER NOT NULL DEFAULT 15,
    "closeoutReserveMinutes" INTEGER NOT NULL DEFAULT 2,
    "heartbeatIntervalSec" INTEGER NOT NULL DEFAULT 25,
    "staleAfterSec" INTEGER NOT NULL DEFAULT 75,
    "transitionMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSupportPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TutorPresence_schoolTeacherId_key" ON "TutorPresence"("schoolTeacherId");
CREATE INDEX "TutorPresence_schoolId_status_lastHeartbeatAt_idx" ON "TutorPresence"("schoolId", "status", "lastHeartbeatAt");
CREATE INDEX "TutorPresence_dayLessonId_idx" ON "TutorPresence"("dayLessonId");

CREATE INDEX "HumanSupportQueueEntry_schoolId_status_enqueuedAt_idx" ON "HumanSupportQueueEntry"("schoolId", "status", "enqueuedAt");
CREATE INDEX "HumanSupportQueueEntry_periodId_status_idx" ON "HumanSupportQueueEntry"("periodId", "status");
CREATE INDEX "HumanSupportQueueEntry_childId_status_idx" ON "HumanSupportQueueEntry"("childId", "status");
CREATE INDEX "HumanSupportQueueEntry_assignedTutorId_status_idx" ON "HumanSupportQueueEntry"("assignedTutorId", "status");

CREATE UNIQUE INDEX "HumanSupportSession_queueEntryId_key" ON "HumanSupportSession"("queueEntryId");
CREATE INDEX "HumanSupportSession_schoolId_status_startedAt_idx" ON "HumanSupportSession"("schoolId", "status", "startedAt");
CREATE INDEX "HumanSupportSession_schoolTeacherId_status_idx" ON "HumanSupportSession"("schoolTeacherId", "status");
CREATE INDEX "HumanSupportSession_childId_startedAt_idx" ON "HumanSupportSession"("childId", "startedAt");
CREATE INDEX "HumanSupportSession_periodId_status_idx" ON "HumanSupportSession"("periodId", "status");

CREATE UNIQUE INDEX "SchoolSupportPolicy_schoolId_key" ON "SchoolSupportPolicy"("schoolId");

ALTER TABLE "TutorPresence" ADD CONSTRAINT "TutorPresence_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TutorPresence" ADD CONSTRAINT "TutorPresence_schoolTeacherId_fkey" FOREIGN KEY ("schoolTeacherId") REFERENCES "SchoolTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HumanSupportQueueEntry" ADD CONSTRAINT "HumanSupportQueueEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanSupportQueueEntry" ADD CONSTRAINT "HumanSupportQueueEntry_assignedTutorId_fkey" FOREIGN KEY ("assignedTutorId") REFERENCES "SchoolTeacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HumanSupportSession" ADD CONSTRAINT "HumanSupportSession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanSupportSession" ADD CONSTRAINT "HumanSupportSession_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "HumanSupportQueueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanSupportSession" ADD CONSTRAINT "HumanSupportSession_schoolTeacherId_fkey" FOREIGN KEY ("schoolTeacherId") REFERENCES "SchoolTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolSupportPolicy" ADD CONSTRAINT "SchoolSupportPolicy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
