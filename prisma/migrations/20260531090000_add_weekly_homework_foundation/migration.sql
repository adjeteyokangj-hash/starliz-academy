-- CreateTable
CREATE TABLE "public"."HomeworkBatch" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "dueBeforeNextSession" BOOLEAN NOT NULL DEFAULT true,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "markedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "sourceCompletedSessionCount" INTEGER NOT NULL DEFAULT 0,
    "sourceStartedSessionCount" INTEGER NOT NULL DEFAULT 0,
    "weaknessSummaryJson" TEXT,
    "workloadCapMinutes" INTEGER NOT NULL DEFAULT 0,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "scorePercent" INTEGER,
    "recapOnly" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "excusedReason" TEXT,
    "extendedDueAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HomeworkQuestion" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "skill" TEXT,
    "questionType" TEXT NOT NULL,
    "promptJson" TEXT NOT NULL,
    "optionsJson" TEXT,
    "expectedAnswerJson" TEXT,
    "markingType" TEXT NOT NULL DEFAULT 'auto',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 1,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "frozenAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HomeworkAnswer" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "draftAnswerJson" TEXT,
    "submittedAnswerJson" TEXT,
    "isAnswered" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "markingStatus" TEXT NOT NULL DEFAULT 'not_marked',
    "isCorrect" BOOLEAN,
    "score" INTEGER,
    "feedbackJson" TEXT,
    "aiConfidence" INTEGER,
    "reviewNeeded" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HomeworkAuditLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeworkBatch_studentId_status_idx" ON "public"."HomeworkBatch"("studentId", "status");

-- CreateIndex
CREATE INDEX "HomeworkBatch_weekStart_weekEnd_idx" ON "public"."HomeworkBatch"("weekStart", "weekEnd");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkBatch_studentId_weekStart_key" ON "public"."HomeworkBatch"("studentId", "weekStart");

-- CreateIndex
CREATE INDEX "HomeworkQuestion_batchId_idx" ON "public"."HomeworkQuestion"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkQuestion_batchId_order_key" ON "public"."HomeworkQuestion"("batchId", "order");

-- CreateIndex
CREATE INDEX "HomeworkAnswer_studentId_batchId_idx" ON "public"."HomeworkAnswer"("studentId", "batchId");

-- CreateIndex
CREATE INDEX "HomeworkAnswer_questionId_idx" ON "public"."HomeworkAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkAnswer_batchId_questionId_studentId_key" ON "public"."HomeworkAnswer"("batchId", "questionId", "studentId");

-- CreateIndex
CREATE INDEX "HomeworkAuditLog_batchId_createdAt_idx" ON "public"."HomeworkAuditLog"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "HomeworkAuditLog_actorUserId_idx" ON "public"."HomeworkAuditLog"("actorUserId");

-- AddForeignKey
ALTER TABLE "public"."HomeworkBatch" ADD CONSTRAINT "HomeworkBatch_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomeworkQuestion" ADD CONSTRAINT "HomeworkQuestion_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."HomeworkBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomeworkAnswer" ADD CONSTRAINT "HomeworkAnswer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."HomeworkBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomeworkAnswer" ADD CONSTRAINT "HomeworkAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."HomeworkQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomeworkAnswer" ADD CONSTRAINT "HomeworkAnswer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomeworkAuditLog" ADD CONSTRAINT "HomeworkAuditLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."HomeworkBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HomeworkAuditLog" ADD CONSTRAINT "HomeworkAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

