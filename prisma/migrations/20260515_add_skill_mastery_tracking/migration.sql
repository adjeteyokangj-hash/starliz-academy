-- CreateTable: SkillMastery
CREATE TABLE IF NOT EXISTS "SkillMastery" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "skillFocus" TEXT NOT NULL,
    "masteryLevel" TEXT NOT NULL DEFAULT 'new',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastMasteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillMastery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SkillMastery_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: MasteryCheckResult
CREATE TABLE IF NOT EXISTS "MasteryCheckResult" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "studentAnswer" TEXT NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "responseTimeMs" INTEGER,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryCheckResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MasteryCheckResult_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MasteryCheckResult_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "SkillMastery"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: CoachInteractionLog
CREATE TABLE IF NOT EXISTS "CoachInteractionLog" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "skillFocus" TEXT,
    "questionText" TEXT NOT NULL,
    "hintLevel" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "studentAnswer" TEXT,
    "correct" BOOLEAN,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachInteractionLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachInteractionLog_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SkillMastery_childId_subject_skillFocus_key" ON "SkillMastery"("childId", "subject", "skillFocus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkillMastery_childId_idx" ON "SkillMastery"("childId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkillMastery_masteryLevel_idx" ON "SkillMastery"("masteryLevel");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MasteryCheckResult_childId_idx" ON "MasteryCheckResult"("childId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MasteryCheckResult_skillId_passed_idx" ON "MasteryCheckResult"("skillId", "passed");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoachInteractionLog_childId_idx" ON "CoachInteractionLog"("childId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoachInteractionLog_subject_idx" ON "CoachInteractionLog"("subject");
