-- Add nullable completion timestamp for assignment completion writeback
ALTER TABLE "Assignment"
ADD COLUMN "completedAt" TIMESTAMP(3);
