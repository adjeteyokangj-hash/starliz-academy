-- Add nullable password-reset fields to User without touching existing data.
ALTER TABLE "public"."User"
ADD COLUMN "passwordResetToken" TEXT,
ADD COLUMN "passwordResetExpires" TIMESTAMP(3);

CREATE INDEX "User_passwordResetToken_idx" ON "public"."User"("passwordResetToken");
