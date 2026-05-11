-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'parent',
    "pinHash" TEXT,
    "activeChildId" TEXT,
    "consentVersion" TEXT,
    "consentAcceptedAt" DATETIME,
    "consentWithdrawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChildProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "age" INTEGER,
    "yearGroup" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "selectedVoice" TEXT NOT NULL DEFAULT 'friendly_coach',
    "selectedTheme" TEXT NOT NULL DEFAULT 'default',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "snapshotJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChildProfile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgressRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "starsEarned" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "score" REAL,
    "correct" BOOLEAN,
    "difficulty" INTEGER,
    "notes" TEXT,
    "accuracy" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answeredCorrectly" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionHistory_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RewardItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "unlockLevel" INTEGER NOT NULL DEFAULT 1,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AIContentCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentType" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "contentJson" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'system'
);

-- CreateTable
CREATE TABLE "ChildReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "isEquipped" BOOLEAN NOT NULL DEFAULT false,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChildReward_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChildReward_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "RewardItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionHistory_childId_questionId_key" ON "QuestionHistory"("childId", "questionId");

-- CreateIndex
CREATE INDEX "AIContentCache_contentType_level_idx" ON "AIContentCache"("contentType", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ChildReward_childId_rewardId_key" ON "ChildReward"("childId", "rewardId");
