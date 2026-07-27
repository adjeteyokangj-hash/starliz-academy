-- Additive Short Learning journey review/publish models.
-- Non-destructive: no drops, no resets, existing sessions preserved.

CREATE TABLE IF NOT EXISTS "ShortLearningJourney" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "yearGroup" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "skillFocus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortLearningJourney_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShortLearningJourneyBlock" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "blockType" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "daytimeStage" TEXT,
    "contentId" TEXT,
    "learningObjective" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortLearningJourneyBlock_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudentLearningBooking"
ADD COLUMN IF NOT EXISTS "journeyId" TEXT;

CREATE INDEX IF NOT EXISTS "ShortLearningJourney_schoolId_subject_yearGroup_durationMinutes_status_idx"
  ON "ShortLearningJourney"("schoolId", "subject", "yearGroup", "durationMinutes", "status");
CREATE INDEX IF NOT EXISTS "ShortLearningJourney_status_publishedAt_idx"
  ON "ShortLearningJourney"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "ShortLearningJourney_schoolId_createdAt_idx"
  ON "ShortLearningJourney"("schoolId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ShortLearningJourneyBlock_journeyId_order_key"
  ON "ShortLearningJourneyBlock"("journeyId", "order");
CREATE INDEX IF NOT EXISTS "ShortLearningJourneyBlock_journeyId_order_idx"
  ON "ShortLearningJourneyBlock"("journeyId", "order");
CREATE INDEX IF NOT EXISTS "ShortLearningJourneyBlock_contentId_idx"
  ON "ShortLearningJourneyBlock"("contentId");

CREATE INDEX IF NOT EXISTS "StudentLearningBooking_journeyId_idx"
  ON "StudentLearningBooking"("journeyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ShortLearningJourney_schoolId_fkey'
  ) THEN
    ALTER TABLE "ShortLearningJourney"
      ADD CONSTRAINT "ShortLearningJourney_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ShortLearningJourneyBlock_journeyId_fkey'
  ) THEN
    ALTER TABLE "ShortLearningJourneyBlock"
      ADD CONSTRAINT "ShortLearningJourneyBlock_journeyId_fkey"
      FOREIGN KEY ("journeyId") REFERENCES "ShortLearningJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningBooking_journeyId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningBooking"
      ADD CONSTRAINT "StudentLearningBooking_journeyId_fkey"
      FOREIGN KEY ("journeyId") REFERENCES "ShortLearningJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
