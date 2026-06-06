CREATE TABLE "GaSource" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceYear" INTEGER,
    "fileName" TEXT,
    "fileReference" TEXT,
    "pageNumber" INTEGER,
    "section" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaWord" (
    "id" TEXT NOT NULL,
    "englishWord" TEXT NOT NULL,
    "gaWord" TEXT NOT NULL,
    "wordType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourcePage" INTEGER,
    "reviewStatus" TEXT NOT NULL DEFAULT 'Pending',
    "audioStatus" TEXT NOT NULL DEFAULT 'Not Started',
    "quizReady" BOOLEAN NOT NULL DEFAULT false,
    "storyReady" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaWord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GaWord_englishWord_gaWord_sourceId_key" ON "GaWord"("englishWord", "gaWord", "sourceId");
CREATE INDEX "GaSource_sourceName_idx" ON "GaSource"("sourceName");
CREATE INDEX "GaSource_sourceYear_idx" ON "GaSource"("sourceYear");
CREATE INDEX "GaSource_pageNumber_idx" ON "GaSource"("pageNumber");
CREATE INDEX "GaSource_section_idx" ON "GaSource"("section");
CREATE INDEX "GaWord_reviewStatus_idx" ON "GaWord"("reviewStatus");
CREATE INDEX "GaWord_category_idx" ON "GaWord"("category");
CREATE INDEX "GaWord_level_idx" ON "GaWord"("level");
CREATE INDEX "GaWord_wordType_idx" ON "GaWord"("wordType");
CREATE INDEX "GaWord_audioStatus_idx" ON "GaWord"("audioStatus");
CREATE INDEX "GaWord_quizReady_idx" ON "GaWord"("quizReady");
CREATE INDEX "GaWord_storyReady_idx" ON "GaWord"("storyReady");
CREATE INDEX "GaWord_sourcePage_idx" ON "GaWord"("sourcePage");

ALTER TABLE "GaWord" ADD CONSTRAINT "GaWord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GaSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
