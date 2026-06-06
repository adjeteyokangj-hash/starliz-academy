CREATE TABLE "GaLesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "packKey" TEXT,
    "lessonOrder" INTEGER NOT NULL DEFAULT 0,
    "publishStatus" TEXT NOT NULL DEFAULT 'Draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaLessonWord" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaLessonWord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaLessonActivity" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaLessonActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaQuizQuestion" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "wordId" TEXT,
    "questionType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaQuizQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GaStudentLessonProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "score" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaStudentLessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GaLesson_slug_key" ON "GaLesson"("slug");
CREATE UNIQUE INDEX "GaLessonWord_lessonId_wordId_key" ON "GaLessonWord"("lessonId", "wordId");
CREATE UNIQUE INDEX "GaStudentLessonProgress_studentId_lessonId_key" ON "GaStudentLessonProgress"("studentId", "lessonId");
CREATE INDEX "GaLesson_publishStatus_idx" ON "GaLesson"("publishStatus");
CREATE INDEX "GaLesson_level_idx" ON "GaLesson"("level");
CREATE INDEX "GaLesson_category_idx" ON "GaLesson"("category");
CREATE INDEX "GaLesson_packKey_lessonOrder_idx" ON "GaLesson"("packKey", "lessonOrder");
CREATE INDEX "GaLessonWord_lessonId_sortOrder_idx" ON "GaLessonWord"("lessonId", "sortOrder");
CREATE INDEX "GaLessonWord_wordId_idx" ON "GaLessonWord"("wordId");
CREATE INDEX "GaLessonActivity_lessonId_sortOrder_idx" ON "GaLessonActivity"("lessonId", "sortOrder");
CREATE INDEX "GaLessonActivity_activityType_idx" ON "GaLessonActivity"("activityType");
CREATE INDEX "GaQuizQuestion_lessonId_sortOrder_idx" ON "GaQuizQuestion"("lessonId", "sortOrder");
CREATE INDEX "GaQuizQuestion_wordId_idx" ON "GaQuizQuestion"("wordId");
CREATE INDEX "GaQuizQuestion_questionType_idx" ON "GaQuizQuestion"("questionType");
CREATE INDEX "GaStudentLessonProgress_studentId_idx" ON "GaStudentLessonProgress"("studentId");
CREATE INDEX "GaStudentLessonProgress_lessonId_idx" ON "GaStudentLessonProgress"("lessonId");
CREATE INDEX "GaStudentLessonProgress_status_idx" ON "GaStudentLessonProgress"("status");

ALTER TABLE "GaLessonWord" ADD CONSTRAINT "GaLessonWord_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaLessonWord" ADD CONSTRAINT "GaLessonWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GaWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GaLessonActivity" ADD CONSTRAINT "GaLessonActivity_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaQuizQuestion" ADD CONSTRAINT "GaQuizQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaQuizQuestion" ADD CONSTRAINT "GaQuizQuestion_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "GaWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GaStudentLessonProgress" ADD CONSTRAINT "GaStudentLessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GaStudentLessonProgress" ADD CONSTRAINT "GaStudentLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "GaLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
