-- Bulk Educational Content Import v1 (additive only).
-- Do not reset. Do not drop existing tables. Preserve all existing Generator / review / publish data.

CREATE TABLE IF NOT EXISTS "LessonPackImport" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "createdByUserId" TEXT,
  "sessionType" TEXT NOT NULL DEFAULT 'school_day',
  "sourceName" TEXT,
  "sourceUrl" TEXT,
  "licenceType" TEXT,
  "attribution" TEXT,
  "notes" TEXT,
  "yearGroupOverride" TEXT,
  "subjectOverride" TEXT,
  "difficultyOverride" INTEGER,
  "detectedYearGroup" TEXT,
  "detectedSubject" TEXT,
  "detectedDifficulty" INTEGER,
  "yearConfidence" DOUBLE PRECISION,
  "subjectConfidence" DOUBLE PRECISION,
  "difficultyConfidence" DOUBLE PRECISION,
  "sourceFingerprint" TEXT,
  "filesJson" TEXT,
  "analysisJson" TEXT,
  "previewJson" TEXT,
  "contentId" TEXT,
  "duplicateOverrideReason" TEXT,
  "thirdPartyDecisionsJson" TEXT,
  "errorJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonPackImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LessonPackImport_status_idx" ON "LessonPackImport"("status");
CREATE INDEX IF NOT EXISTS "LessonPackImport_sourceFingerprint_idx" ON "LessonPackImport"("sourceFingerprint");
CREATE INDEX IF NOT EXISTS "LessonPackImport_createdByUserId_idx" ON "LessonPackImport"("createdByUserId");
CREATE INDEX IF NOT EXISTS "LessonPackImport_contentId_idx" ON "LessonPackImport"("contentId");
