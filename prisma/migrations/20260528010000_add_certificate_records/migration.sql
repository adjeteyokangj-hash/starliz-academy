-- Add first-class certificate records without altering existing JSON certificate storage.
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "certificateType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "awardReason" TEXT,
    "subject" TEXT,
    "level" TEXT,
    "yearGroup" TEXT,
    "score" DOUBLE PRECISION,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "metadataJson" TEXT,
    "awardSourceType" TEXT,
    "awardSourceId" TEXT,
    "rank" INTEGER,
    "rankLabel" TEXT,
    "competitionName" TEXT,
    "testName" TEXT,
    "tiedRank" BOOLEAN,
    "rankingMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Certificate_certificateNumber_key" ON "Certificate"("certificateNumber");
CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON "Certificate"("verificationCode");
CREATE UNIQUE INDEX "Certificate_idempotencyKey_key" ON "Certificate"("idempotencyKey");
CREATE INDEX "Certificate_studentId_idx" ON "Certificate"("studentId");
CREATE INDEX "Certificate_certificateType_idx" ON "Certificate"("certificateType");
CREATE INDEX "Certificate_awardSourceType_awardSourceId_idx" ON "Certificate"("awardSourceType", "awardSourceId");

ALTER TABLE "Certificate"
ADD CONSTRAINT "Certificate_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
