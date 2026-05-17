-- AlterTable: add parent PIN security fields to User
ALTER TABLE "User" ADD COLUMN "parentPinFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "parentPinLockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "parentPinUpdatedAt" TIMESTAMP(3);

-- CreateTable: ParentPinResetToken
CREATE TABLE "ParentPinResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentPinResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentPinResetToken_tokenHash_key" ON "ParentPinResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ParentPinResetToken_userId_idx" ON "ParentPinResetToken"("userId");

-- CreateIndex
CREATE INDEX "ParentPinResetToken_expiresAt_idx" ON "ParentPinResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "ParentPinResetToken" ADD CONSTRAINT "ParentPinResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
