-- CreateTable
CREATE TABLE "StudentQuestionExposure" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "yearGroup" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "contentId" TEXT,
    "bookingId" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentQuestionExposure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentQuestionExposure_studentId_subject_yearGroup_fingerprint_key" ON "StudentQuestionExposure"("studentId", "subject", "yearGroup", "fingerprint");

-- CreateIndex
CREATE INDEX "StudentQuestionExposure_schoolId_subject_yearGroup_fingerprint_idx" ON "StudentQuestionExposure"("schoolId", "subject", "yearGroup", "fingerprint");

-- CreateIndex
CREATE INDEX "StudentQuestionExposure_studentId_subject_yearGroup_idx" ON "StudentQuestionExposure"("studentId", "subject", "yearGroup");

-- AddForeignKey
ALTER TABLE "StudentQuestionExposure" ADD CONSTRAINT "StudentQuestionExposure_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionExposure" ADD CONSTRAINT "StudentQuestionExposure_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
