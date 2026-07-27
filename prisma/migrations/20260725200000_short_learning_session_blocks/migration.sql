-- Additive migration: Short Learning multi-block session content.
-- No DROP TABLE / DROP COLUMN / truncate / data wipe.
-- Content packs reuse Daytime AIContentCache rows (no second generator).

CREATE TABLE IF NOT EXISTS "ShortLearningSession" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "yearGroup" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "currentBlockOrder" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "regeneratedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShortLearningSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShortLearningSession_bookingId_key" ON "ShortLearningSession"("bookingId");
CREATE INDEX IF NOT EXISTS "ShortLearningSession_status_generatedAt_idx" ON "ShortLearningSession"("status", "generatedAt");

DO $$ BEGIN
  ALTER TABLE "ShortLearningSession"
    ADD CONSTRAINT "ShortLearningSession_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "StudentLearningBooking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ShortLearningBlock" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "blockType" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "daytimeStage" TEXT,
    "contentId" TEXT,
    "learningObjective" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShortLearningBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShortLearningBlock_sessionId_order_key" ON "ShortLearningBlock"("sessionId", "order");
CREATE INDEX IF NOT EXISTS "ShortLearningBlock_sessionId_order_idx" ON "ShortLearningBlock"("sessionId", "order");
CREATE INDEX IF NOT EXISTS "ShortLearningBlock_contentId_idx" ON "ShortLearningBlock"("contentId");

DO $$ BEGIN
  ALTER TABLE "ShortLearningBlock"
    ADD CONSTRAINT "ShortLearningBlock_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ShortLearningSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
