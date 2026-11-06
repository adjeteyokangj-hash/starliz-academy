-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "ageGroup" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contentRefs" TEXT,
    "skills" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RewardRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobRunLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "error" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WeakArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "keyStage" TEXT,
    "yearGroup" TEXT,
    "skillFocus" TEXT NOT NULL,
    "weaknessType" TEXT NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "attemptsCount" INTEGER NOT NULL,
    "currentDifficulty" INTEGER NOT NULL DEFAULT 1,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeakArea_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "AIContentCache" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "accuracy" REAL NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'weak',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSkill_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutlookToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminUserId" TEXT NOT NULL,
    "microsoftUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminUserId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "messageId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIContentCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentType" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "contentJson" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewedAt" DATETIME,
    "approvedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "model" TEXT,
    "prompt" TEXT,
    "keyStage" TEXT,
    "yearGroup" TEXT,
    "skillFocus" TEXT,
    "skills" TEXT,
    "metadataJson" TEXT,
    "estimatedCostPence" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_AIContentCache" ("approvedAt", "contentJson", "contentType", "createdAt", "createdBy", "id", "level", "publishedAt", "reviewedAt", "status", "topic", "usedCount") SELECT "approvedAt", "contentJson", "contentType", "createdAt", "createdBy", "id", "level", "publishedAt", "reviewedAt", "status", "topic", "usedCount" FROM "AIContentCache";
DROP TABLE "AIContentCache";
ALTER TABLE "new_AIContentCache" RENAME TO "AIContentCache";
CREATE INDEX "AIContentCache_contentType_level_idx" ON "AIContentCache"("contentType", "level");
CREATE INDEX "AIContentCache_status_idx" ON "AIContentCache"("status");
CREATE TABLE "new_AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "lastLoginAt" DATETIME,
    "lastLoginIpAddress" TEXT,
    "lastLoginUserAgent" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedReason" TEXT,
    "lockedUntil" DATETIME,
    "deletionRequestedAt" DATETIME,
    "deletionRequester" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AdminUser" ("active", "createdAt", "deletionRequestedAt", "deletionRequester", "id", "isLocked", "lastLoginAt", "lastLoginIpAddress", "lastLoginUserAgent", "lockedReason", "lockedUntil", "roleId", "title", "updatedAt", "userId") SELECT "active", "createdAt", "deletionRequestedAt", "deletionRequester", "id", "isLocked", "lastLoginAt", "lastLoginIpAddress", "lastLoginUserAgent", "lockedReason", "lockedUntil", "roleId", "title", "updatedAt", "userId" FROM "AdminUser";
DROP TABLE "AdminUser";
ALTER TABLE "new_AdminUser" RENAME TO "AdminUser";
CREATE UNIQUE INDEX "AdminUser_userId_key" ON "AdminUser"("userId");
CREATE INDEX "AdminUser_active_idx" ON "AdminUser"("active");
CREATE INDEX "AdminUser_roleId_idx" ON "AdminUser"("roleId");
CREATE TABLE "new_DeleteApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetUserId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestIpAddress" TEXT,
    "requestUserAgent" TEXT,
    "approvalIpAddress" TEXT,
    "approvalUserAgent" TEXT,
    "denialReason" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "deniedAt" DATETIME,
    "executedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeleteApproval_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeleteApproval_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeleteApproval_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeleteApproval" ("approvalIpAddress", "approvalUserAgent", "approvedAt", "approvedByUserId", "createdAt", "denialReason", "deniedAt", "entityId", "entityType", "executedAt", "expiresAt", "id", "reason", "requestIpAddress", "requestUserAgent", "requestedAt", "requestedByUserId", "status", "targetUserId", "updatedAt") SELECT "approvalIpAddress", "approvalUserAgent", "approvedAt", "approvedByUserId", "createdAt", "denialReason", "deniedAt", "entityId", "entityType", "executedAt", "expiresAt", "id", "reason", "requestIpAddress", "requestUserAgent", "requestedAt", "requestedByUserId", "status", "targetUserId", "updatedAt" FROM "DeleteApproval";
DROP TABLE "DeleteApproval";
ALTER TABLE "new_DeleteApproval" RENAME TO "DeleteApproval";
CREATE INDEX "DeleteApproval_targetUserId_status_idx" ON "DeleteApproval"("targetUserId", "status");
CREATE INDEX "DeleteApproval_requestedByUserId_status_idx" ON "DeleteApproval"("requestedByUserId", "status");
CREATE INDEX "DeleteApproval_entityType_entityId_idx" ON "DeleteApproval"("entityType", "entityId");
CREATE INDEX "DeleteApproval_status_expiresAt_idx" ON "DeleteApproval"("status", "expiresAt");
CREATE TABLE "new_PricingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "interval" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "priceNote" TEXT,
    "badge" TEXT,
    "ctaLabel" TEXT NOT NULL,
    "ctaHref" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PricingPlan" ("audience", "badge", "createdAt", "ctaHref", "ctaLabel", "currency", "description", "features", "id", "interval", "isActive", "isPopular", "name", "price", "priceNote", "sortOrder", "stripePriceId", "updatedAt") SELECT "audience", "badge", "createdAt", "ctaHref", "ctaLabel", "currency", "description", "features", "id", "interval", "isActive", "isPopular", "name", "price", "priceNote", "sortOrder", "stripePriceId", "updatedAt" FROM "PricingPlan";
DROP TABLE "PricingPlan";
ALTER TABLE "new_PricingPlan" RENAME TO "PricingPlan";
CREATE INDEX "PricingPlan_isActive_sortOrder_idx" ON "PricingPlan"("isActive", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SupportTicket_parentId_idx" ON "SupportTicket"("parentId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "JobRunLog_jobName_startedAt_idx" ON "JobRunLog"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "JobRunLog_status_idx" ON "JobRunLog"("status");

-- CreateIndex
CREATE INDEX "WeakArea_status_idx" ON "WeakArea"("status");

-- CreateIndex
CREATE INDEX "WeakArea_subject_skillFocus_idx" ON "WeakArea"("subject", "skillFocus");

-- CreateIndex
CREATE UNIQUE INDEX "WeakArea_studentId_subject_skillFocus_key" ON "WeakArea"("studentId", "subject", "skillFocus");

-- CreateIndex
CREATE INDEX "Assignment_studentId_status_idx" ON "Assignment"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_studentId_contentId_key" ON "Assignment"("studentId", "contentId");

-- CreateIndex
CREATE INDEX "StudentSkill_studentId_status_idx" ON "StudentSkill"("studentId", "status");

-- CreateIndex
CREATE INDEX "StudentSkill_skill_idx" ON "StudentSkill"("skill");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSkill_studentId_skill_key" ON "StudentSkill"("studentId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "OutlookToken_adminUserId_key" ON "OutlookToken"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminEmail_adminUserId_direction_idx" ON "AdminEmail"("adminUserId", "direction");

-- CreateIndex
CREATE INDEX "AdminEmail_adminUserId_isRead_idx" ON "AdminEmail"("adminUserId", "isRead");

