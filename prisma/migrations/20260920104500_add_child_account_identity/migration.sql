-- Additive child-account identity for parent-login redesign.
-- Existing parents and ChildProfiles remain valid without backfill (NULL username / userId allowed).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ChildProfile_userId_key" ON "ChildProfile"("userId");

-- AddForeignKey
-- SetNull: deleting a student User must not cascade-delete the parent's ChildProfile
-- (learning history and parent ownership live on ChildProfile).
ALTER TABLE "ChildProfile" ADD CONSTRAINT "ChildProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
