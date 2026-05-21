-- CreateTable
CREATE TABLE "TrialAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailConsent" BOOLEAN NOT NULL DEFAULT false,
    "activitiesRemaining" INTEGER NOT NULL DEFAULT 10,
    "spellingRemaining" INTEGER NOT NULL DEFAULT 4,
    "readingRemaining" INTEGER NOT NULL DEFAULT 3,
    "mathsRemaining" INTEGER NOT NULL DEFAULT 3,
    "trialStartedAt" TIMESTAMP(3) NOT NULL,
    "trialExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,
    "activitiesCompleted" INTEGER NOT NULL DEFAULT 0,
    "wordsMastered" INTEGER NOT NULL DEFAULT 0,
    "subjectUsageJson" TEXT,
    "subjectsUsed" TEXT,
    "lastActivity" TEXT,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "convertedToAccount" BOOLEAN NOT NULL DEFAULT false,
    "upgradedAt" TIMESTAMP(3),
    "sessionTokenHash" TEXT,
    "sessionIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialAccount_email_key" ON "TrialAccount"("email");

-- CreateIndex
CREATE INDEX "TrialAccount_trialExpiresAt_idx" ON "TrialAccount"("trialExpiresAt");

-- CreateIndex
CREATE INDEX "TrialAccount_lastActiveAt_idx" ON "TrialAccount"("lastActiveAt");

-- CreateIndex
CREATE INDEX "TrialAccount_convertedToAccount_idx" ON "TrialAccount"("convertedToAccount");
