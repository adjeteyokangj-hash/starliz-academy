-- AlterTable
ALTER TABLE "public"."Lesson" ADD COLUMN     "difficultyBand" TEXT NOT NULL DEFAULT 'core',
ADD COLUMN     "keyStage" TEXT,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "pathway" TEXT,
ADD COLUMN     "skillFocus" TEXT,
ADD COLUMN     "template" TEXT,
ADD COLUMN     "yearGroup" TEXT;
