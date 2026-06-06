CREATE TYPE "GaAudioSourceType" AS ENUM ('AI_GENERATED', 'AI_GENERATED_SONG', 'ADMIN_UPLOADED', 'PRONUNCIATION_REFERENCE', 'STUDENT_RECORDING', 'FUTURE_NATIVE_SPEAKER', 'NATIVE_VERIFIED');
CREATE TYPE "GaAudioReviewStatus" AS ENUM ('DRAFT', 'AI_GENERATED', 'APPROVED_FOR_EARLY_LEARNING', 'NEEDS_NATIVE_REVIEW', 'NATIVE_VERIFIED', 'REJECTED', 'REPLACED');
CREATE TYPE "GaAudioApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REPLACED');
CREATE TYPE "GaReferencePermissionStatus" AS ENUM ('UNKNOWN', 'REFERENCE_ONLY', 'LICENSED');
CREATE TYPE "GaStudentRecordingReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'NEEDS_REPEAT', 'FLAGGED');

CREATE TABLE "GaSongLesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lyricsGa" TEXT NOT NULL,
    "lyricsEnglish" TEXT,
    "wordIdsUsed" TEXT[],
    "unapprovedWordsFlagged" TEXT[],
    "currentAudioAssetId" TEXT,
    "sourceType" "GaAudioSourceType",
    "reviewStatus" "GaAudioReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "GaSongLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaAudioAsset" (
    "id" TEXT NOT NULL,
    "wordId" TEXT,
    "lessonId" TEXT,
    "phraseText" TEXT,
    "songId" TEXT,
    "letterKey" TEXT,
    "soundKey" TEXT,
    "audioUrl" TEXT NOT NULL,
    "audioStorageKey" TEXT,
    "sourceType" "GaAudioSourceType" NOT NULL,
    "reviewStatus" "GaAudioReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "GaAudioApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "confidenceLevel" INTEGER,
    "pronunciationNote" TEXT,
    "adminNotes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "replacedByAudioId" TEXT,

    CONSTRAINT "GaAudioAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaPronunciationReference" (
    "id" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "speakerName" TEXT,
    "channelName" TEXT,
    "timestampStart" TEXT,
    "timestampEnd" TEXT,
    "linkedWordId" TEXT,
    "linkedLessonId" TEXT,
    "linkedLetter" TEXT,
    "linkedSound" TEXT,
    "linkedPhraseText" TEXT,
    "pronunciationNote" TEXT,
    "permissionStatus" "GaReferencePermissionStatus" NOT NULL DEFAULT 'REFERENCE_ONLY',
    "reviewStatus" "GaAudioReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "confidenceLevel" INTEGER,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaPronunciationReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaStudentRecording" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "wordId" TEXT,
    "lessonId" TEXT,
    "phraseText" TEXT,
    "soundKey" TEXT,
    "audioUrl" TEXT NOT NULL,
    "audioStorageKey" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "studentConfidence" INTEGER,
    "aiFeedbackSummary" TEXT,
    "adminFeedback" TEXT,
    "reviewStatus" "GaStudentRecordingReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "GaStudentRecording_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaAudioAuditLog" (
    "id" TEXT NOT NULL,
    "audioAssetId" TEXT,
    "referenceId" TEXT,
    "studentRecordingId" TEXT,
    "action" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT,
    "notes" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaAudioAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GaSongLesson_currentAudioAssetId_key" ON "GaSongLesson"("currentAudioAssetId");
CREATE INDEX "GaSongLesson_level_idx" ON "GaSongLesson"("level");
CREATE INDEX "GaSongLesson_category_idx" ON "GaSongLesson"("category");
CREATE INDEX "GaSongLesson_sourceType_idx" ON "GaSongLesson"("sourceType");
CREATE INDEX "GaSongLesson_reviewStatus_idx" ON "GaSongLesson"("reviewStatus");
CREATE INDEX "GaSongLesson_createdById_idx" ON "GaSongLesson"("createdById");
CREATE INDEX "GaSongLesson_approvedById_idx" ON "GaSongLesson"("approvedById");

CREATE INDEX "GaAudioAsset_wordId_idx" ON "GaAudioAsset"("wordId");
CREATE INDEX "GaAudioAsset_lessonId_idx" ON "GaAudioAsset"("lessonId");
CREATE INDEX "GaAudioAsset_songId_idx" ON "GaAudioAsset"("songId");
CREATE INDEX "GaAudioAsset_sourceType_idx" ON "GaAudioAsset"("sourceType");
CREATE INDEX "GaAudioAsset_reviewStatus_idx" ON "GaAudioAsset"("reviewStatus");
CREATE INDEX "GaAudioAsset_approvalStatus_idx" ON "GaAudioAsset"("approvalStatus");
CREATE INDEX "GaAudioAsset_createdById_idx" ON "GaAudioAsset"("createdById");
CREATE INDEX "GaAudioAsset_approvedById_idx" ON "GaAudioAsset"("approvedById");
CREATE INDEX "GaAudioAsset_rejectedById_idx" ON "GaAudioAsset"("rejectedById");
CREATE INDEX "GaAudioAsset_letterKey_idx" ON "GaAudioAsset"("letterKey");
CREATE INDEX "GaAudioAsset_soundKey_idx" ON "GaAudioAsset"("soundKey");

CREATE INDEX "GaPronunciationReference_referenceType_idx" ON "GaPronunciationReference"("referenceType");
CREATE INDEX "GaPronunciationReference_linkedWordId_idx" ON "GaPronunciationReference"("linkedWordId");
CREATE INDEX "GaPronunciationReference_linkedLessonId_idx" ON "GaPronunciationReference"("linkedLessonId");
CREATE INDEX "GaPronunciationReference_linkedLetter_idx" ON "GaPronunciationReference"("linkedLetter");
CREATE INDEX "GaPronunciationReference_linkedSound_idx" ON "GaPronunciationReference"("linkedSound");
CREATE INDEX "GaPronunciationReference_permissionStatus_idx" ON "GaPronunciationReference"("permissionStatus");
CREATE INDEX "GaPronunciationReference_reviewStatus_idx" ON "GaPronunciationReference"("reviewStatus");
CREATE INDEX "GaPronunciationReference_createdById_idx" ON "GaPronunciationReference"("createdById");
CREATE INDEX "GaPronunciationReference_reviewedById_idx" ON "GaPronunciationReference"("reviewedById");

CREATE INDEX "GaStudentRecording_studentId_idx" ON "GaStudentRecording"("studentId");
CREATE INDEX "GaStudentRecording_wordId_idx" ON "GaStudentRecording"("wordId");
CREATE INDEX "GaStudentRecording_lessonId_idx" ON "GaStudentRecording"("lessonId");
CREATE INDEX "GaStudentRecording_soundKey_idx" ON "GaStudentRecording"("soundKey");
CREATE INDEX "GaStudentRecording_reviewStatus_idx" ON "GaStudentRecording"("reviewStatus");
CREATE INDEX "GaStudentRecording_reviewedById_idx" ON "GaStudentRecording"("reviewedById");

CREATE INDEX "GaAudioAuditLog_audioAssetId_idx" ON "GaAudioAuditLog"("audioAssetId");
CREATE INDEX "GaAudioAuditLog_referenceId_idx" ON "GaAudioAuditLog"("referenceId");
CREATE INDEX "GaAudioAuditLog_studentRecordingId_idx" ON "GaAudioAuditLog"("studentRecordingId");
CREATE INDEX "GaAudioAuditLog_action_idx" ON "GaAudioAuditLog"("action");
CREATE INDEX "GaAudioAuditLog_performedById_idx" ON "GaAudioAuditLog"("performedById");
CREATE INDEX "GaAudioAuditLog_createdAt_idx" ON "GaAudioAuditLog"("createdAt");

ALTER TABLE "GaSongLesson" ADD CONSTRAINT "GaSongLesson_currentAudioAssetId_fkey" FOREIGN KEY ("currentAudioAssetId") REFERENCES "GaAudioAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaSongLesson" ADD CONSTRAINT "GaSongLesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaSongLesson" ADD CONSTRAINT "GaSongLesson_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GaAudioAsset" ADD CONSTRAINT "GaAudioAsset_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GaWord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaAudioAsset" ADD CONSTRAINT "GaAudioAsset_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaAudioAsset" ADD CONSTRAINT "GaAudioAsset_songId_fkey" FOREIGN KEY ("songId") REFERENCES "GaSongLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaAudioAsset" ADD CONSTRAINT "GaAudioAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaAudioAsset" ADD CONSTRAINT "GaAudioAsset_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaAudioAsset" ADD CONSTRAINT "GaAudioAsset_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaAudioAsset" ADD CONSTRAINT "GaAudioAsset_replacedByAudioId_fkey" FOREIGN KEY ("replacedByAudioId") REFERENCES "GaAudioAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GaPronunciationReference" ADD CONSTRAINT "GaPronunciationReference_linkedWordId_fkey" FOREIGN KEY ("linkedWordId") REFERENCES "GaWord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaPronunciationReference" ADD CONSTRAINT "GaPronunciationReference_linkedLessonId_fkey" FOREIGN KEY ("linkedLessonId") REFERENCES "GaLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaPronunciationReference" ADD CONSTRAINT "GaPronunciationReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaPronunciationReference" ADD CONSTRAINT "GaPronunciationReference_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GaStudentRecording" ADD CONSTRAINT "GaStudentRecording_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaStudentRecording" ADD CONSTRAINT "GaStudentRecording_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GaWord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaStudentRecording" ADD CONSTRAINT "GaStudentRecording_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaStudentRecording" ADD CONSTRAINT "GaStudentRecording_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GaAudioAuditLog" ADD CONSTRAINT "GaAudioAuditLog_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "GaAudioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaAudioAuditLog" ADD CONSTRAINT "GaAudioAuditLog_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "GaPronunciationReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaAudioAuditLog" ADD CONSTRAINT "GaAudioAuditLog_studentRecordingId_fkey" FOREIGN KEY ("studentRecordingId") REFERENCES "GaStudentRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaAudioAuditLog" ADD CONSTRAINT "GaAudioAuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
