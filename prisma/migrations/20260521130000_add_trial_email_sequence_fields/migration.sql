-- AlterTable
ALTER TABLE "TrialAccount"
ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3),
ADD COLUMN "continueEmailSentAt" TIMESTAMP(3),
ADD COLUMN "progressEmailSentAt" TIMESTAMP(3),
ADD COLUMN "upgradeEmailSentAt" TIMESTAMP(3),
ADD COLUMN "lastEmailSentAt" TIMESTAMP(3);
