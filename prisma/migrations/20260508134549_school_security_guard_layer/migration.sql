-- CreateTable
CREATE TABLE "SchoolInviteToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "inviteType" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "targetRole" TEXT,
    "targetSchoolStudentId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "consumedByUserId" TEXT,
    "createdByUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolInviteToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolInviteToken_consumedByUserId_fkey" FOREIGN KEY ("consumedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SchoolInviteToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolTeacherId" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "denialReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolAccessLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LicenceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "schoolLicenceId" TEXT,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "nextStatus" TEXT,
    "actorUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LicenceEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LicenceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SafeguardingIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "reportedByUserId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "SafeguardingIncident_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SafeguardingIncident_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SafeguardingIncident_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolInviteToken_tokenHash_key" ON "SchoolInviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_schoolId_inviteType_idx" ON "SchoolInviteToken"("schoolId", "inviteType");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_schoolId_targetEmail_idx" ON "SchoolInviteToken"("schoolId", "targetEmail");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_expiresAt_idx" ON "SchoolInviteToken"("expiresAt");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_usedAt_idx" ON "SchoolInviteToken"("usedAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_schoolId_createdAt_idx" ON "SchoolAccessLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_userId_createdAt_idx" ON "SchoolAccessLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_schoolTeacherId_createdAt_idx" ON "SchoolAccessLog"("schoolTeacherId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_success_createdAt_idx" ON "SchoolAccessLog"("success", "createdAt");

-- CreateIndex
CREATE INDEX "LicenceEvent_schoolId_createdAt_idx" ON "LicenceEvent"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "LicenceEvent_schoolLicenceId_createdAt_idx" ON "LicenceEvent"("schoolLicenceId", "createdAt");

-- CreateIndex
CREATE INDEX "LicenceEvent_eventType_createdAt_idx" ON "LicenceEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_schoolId_status_idx" ON "SafeguardingIncident"("schoolId", "status");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_schoolId_severity_idx" ON "SafeguardingIncident"("schoolId", "severity");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_studentId_createdAt_idx" ON "SafeguardingIncident"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_reportedByUserId_createdAt_idx" ON "SafeguardingIncident"("reportedByUserId", "createdAt");
