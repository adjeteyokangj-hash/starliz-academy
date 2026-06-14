CREATE TYPE "GaAudioQualityStatus" AS ENUM ('UNCHECKED', 'GOOD', 'TOO_QUIET', 'TOO_LOUD', 'NEEDS_CLEANUP');
CREATE TYPE "GaAudioEnhancementStatus" AS ENUM ('NOT_APPLIED', 'QUEUED', 'APPLIED', 'FAILED', 'BYPASSED');

ALTER TABLE "GaAudioAsset"
  ADD COLUMN "qualityStatus" "GaAudioQualityStatus" NOT NULL DEFAULT 'UNCHECKED',
  ADD COLUMN "enhancementStatus" "GaAudioEnhancementStatus" NOT NULL DEFAULT 'NOT_APPLIED',
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

ALTER TABLE "GaAudioAsset"
  ADD CONSTRAINT "GaAudioAsset_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GaAudioAsset_qualityStatus_idx" ON "GaAudioAsset"("qualityStatus");
CREATE INDEX "GaAudioAsset_enhancementStatus_idx" ON "GaAudioAsset"("enhancementStatus");
CREATE INDEX "GaAudioAsset_deletedById_idx" ON "GaAudioAsset"("deletedById");
CREATE INDEX "GaAudioAsset_deletedAt_idx" ON "GaAudioAsset"("deletedAt");
