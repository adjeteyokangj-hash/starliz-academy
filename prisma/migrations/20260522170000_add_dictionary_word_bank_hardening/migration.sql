-- CreateTable
CREATE TABLE "public"."DictionaryWord" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "normalizedWord" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "keyStage" TEXT NOT NULL,
    "yearGroup" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'easy',
    "topic" TEXT,
    "skillFocus" TEXT,
    "definitionChild" TEXT NOT NULL,
    "definitionParent" TEXT,
    "exampleSentence" TEXT,
    "secondExampleSentence" TEXT,
    "phonicsPattern" TEXT,
    "syllables" TEXT,
    "pronunciationHint" TEXT,
    "synonyms" TEXT[],
    "antonyms" TEXT[],
    "relatedWords" TEXT[],
    "isTrickyWord" BOOLEAN NOT NULL DEFAULT false,
    "isTopicKeyword" BOOLEAN NOT NULL DEFAULT false,
    "isMathsKeyword" BOOLEAN NOT NULL DEFAULT false,
    "isScienceKeyword" BOOLEAN NOT NULL DEFAULT false,
    "isReadingKeyword" BOOLEAN NOT NULL DEFAULT false,
    "isSpellingKeyword" BOOLEAN NOT NULL DEFAULT false,
    "interventionTags" TEXT[],
    "senTags" TEXT[],
    "safeguardingTags" TEXT[],
    "curriculumTags" TEXT[],
    "importSource" TEXT DEFAULT 'manual',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "deactivatedByUserId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CoachDictionaryLookup" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "normalizedWord" TEXT NOT NULL,
    "subject" TEXT,
    "keyStage" TEXT,
    "yearGroup" TEXT,
    "dictionaryWordId" TEXT,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachDictionaryLookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DictionaryBulkImportHistory" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "initiatedByUserId" TEXT,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DictionaryBulkImportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DictionaryWord_normalizedWord_idx" ON "public"."DictionaryWord"("normalizedWord");

-- CreateIndex
CREATE INDEX "DictionaryWord_subject_idx" ON "public"."DictionaryWord"("subject");

-- CreateIndex
CREATE INDEX "DictionaryWord_keyStage_idx" ON "public"."DictionaryWord"("keyStage");

-- CreateIndex
CREATE INDEX "DictionaryWord_yearGroup_idx" ON "public"."DictionaryWord"("yearGroup");

-- CreateIndex
CREATE INDEX "DictionaryWord_subject_keyStage_idx" ON "public"."DictionaryWord"("subject", "keyStage");

-- CreateIndex
CREATE INDEX "DictionaryWord_subject_keyStage_yearGroup_idx" ON "public"."DictionaryWord"("subject", "keyStage", "yearGroup");

-- CreateIndex
CREATE INDEX "DictionaryWord_active_subject_idx" ON "public"."DictionaryWord"("active", "subject");

-- CreateIndex
CREATE INDEX "DictionaryWord_active_keyStage_idx" ON "public"."DictionaryWord"("active", "keyStage");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryWord_normalizedWord_subject_keyStage_yearGroup_key" ON "public"."DictionaryWord"("normalizedWord", "subject", "keyStage", "yearGroup");

-- CreateIndex
CREATE INDEX "CoachDictionaryLookup_normalizedWord_idx" ON "public"."CoachDictionaryLookup"("normalizedWord");

-- CreateIndex
CREATE INDEX "CoachDictionaryLookup_found_idx" ON "public"."CoachDictionaryLookup"("found");

-- CreateIndex
CREATE INDEX "CoachDictionaryLookup_dictionaryWordId_idx" ON "public"."CoachDictionaryLookup"("dictionaryWordId");

-- CreateIndex
CREATE INDEX "CoachDictionaryLookup_subject_keyStage_idx" ON "public"."CoachDictionaryLookup"("subject", "keyStage");

-- CreateIndex
CREATE INDEX "CoachDictionaryLookup_createdAt_idx" ON "public"."CoachDictionaryLookup"("createdAt");

-- CreateIndex
CREATE INDEX "DictionaryBulkImportHistory_source_idx" ON "public"."DictionaryBulkImportHistory"("source");

-- CreateIndex
CREATE INDEX "DictionaryBulkImportHistory_initiatedByUserId_idx" ON "public"."DictionaryBulkImportHistory"("initiatedByUserId");

-- CreateIndex
CREATE INDEX "DictionaryBulkImportHistory_createdAt_idx" ON "public"."DictionaryBulkImportHistory"("createdAt");

