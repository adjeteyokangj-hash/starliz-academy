-- CreateTable AdminRole (new schema with permissions array)
CREATE TABLE "AdminRole_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Copy existing data
INSERT INTO "AdminRole_new" ("id", "name", "description", "permissions", "isBuiltIn", "createdAt", "updatedAt")
SELECT "id", "name", "description", "permissionsJson" as "permissions", false, "createdAt", "updatedAt"
FROM "AdminRole";

-- Drop old table and rename
DROP TABLE "AdminRole";
ALTER TABLE "AdminRole_new" RENAME TO "AdminRole";

-- CreateTable AdminUser (with new audit fields)
CREATE TABLE "AdminUser_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
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
    CONSTRAINT "AdminUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole" ("id") ON DELETE SET NULL
);

-- Copy existing data
INSERT INTO "AdminUser_new" ("id", "userId", "roleId", "active", "title", "createdAt", "updatedAt")
SELECT "id", "userId", "roleId", "active", "title", "createdAt", "updatedAt"
FROM "AdminUser";

-- Create indexes for AdminUser
CREATE INDEX "AdminUser_active_idx" ON "AdminUser_new"("active");
CREATE INDEX "AdminUser_roleId_idx" ON "AdminUser_new"("roleId");

-- Drop old table and rename
DROP TABLE "AdminUser";
ALTER TABLE "AdminUser_new" RENAME TO "AdminUser";

-- CreateTable DeleteApproval
CREATE TABLE "DeleteApproval" (
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
    CONSTRAINT "DeleteApproval_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE,
    CONSTRAINT "DeleteApproval_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE,
    CONSTRAINT "DeleteApproval_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL
);

-- Create indexes for DeleteApproval
CREATE INDEX "DeleteApproval_targetUserId_status_idx" ON "DeleteApproval"("targetUserId", "status");
CREATE INDEX "DeleteApproval_requestedByUserId_status_idx" ON "DeleteApproval"("requestedByUserId", "status");
CREATE INDEX "DeleteApproval_entityType_entityId_idx" ON "DeleteApproval"("entityType", "entityId");
CREATE INDEX "DeleteApproval_status_expiresAt_idx" ON "DeleteApproval"("status", "expiresAt");
