-- CreateTable
CREATE TABLE "TeacherInviteToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolTeacherId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "resentAt" DATETIME,
    "resentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherInviteToken_schoolTeacherId_fkey" FOREIGN KEY ("schoolTeacherId") REFERENCES "SchoolTeacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadataJson" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolLoginHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolLoginHistory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolLoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ParentSchoolLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "schoolStudentId" TEXT NOT NULL,
    "canReceiveReports" BOOLEAN NOT NULL DEFAULT true,
    "canMessageTeachers" BOOLEAN NOT NULL DEFAULT true,
    "consentGivenAt" DATETIME,
    "consentWithdrawnAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ParentSchoolLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ParentSchoolLink_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ParentSchoolLink_schoolStudentId_fkey" FOREIGN KEY ("schoolStudentId") REFERENCES "SchoolStudent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolSafeguardingAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "contentRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "resolvedAt" DATETIME,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchoolSafeguardingAlert_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolSafeguardingAlert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherInviteToken_tokenHash_key" ON "TeacherInviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TeacherInviteToken_schoolTeacherId_idx" ON "TeacherInviteToken"("schoolTeacherId");

-- CreateIndex
CREATE INDEX "TeacherInviteToken_expiresAt_idx" ON "TeacherInviteToken"("expiresAt");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_schoolId_createdAt_idx" ON "SchoolAuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_schoolId_action_idx" ON "SchoolAuditLog"("schoolId", "action");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_entityType_entityId_idx" ON "SchoolAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_severity_createdAt_idx" ON "SchoolAuditLog"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolLoginHistory_schoolId_createdAt_idx" ON "SchoolLoginHistory"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolLoginHistory_userId_createdAt_idx" ON "SchoolLoginHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolLoginHistory_success_createdAt_idx" ON "SchoolLoginHistory"("success", "createdAt");

-- CreateIndex
CREATE INDEX "ParentSchoolLink_schoolId_status_idx" ON "ParentSchoolLink"("schoolId", "status");

-- CreateIndex
CREATE INDEX "ParentSchoolLink_parentUserId_idx" ON "ParentSchoolLink"("parentUserId");

-- CreateIndex
CREATE INDEX "ParentSchoolLink_schoolStudentId_idx" ON "ParentSchoolLink"("schoolStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentSchoolLink_schoolId_parentUserId_schoolStudentId_key" ON "ParentSchoolLink"("schoolId", "parentUserId", "schoolStudentId");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_schoolId_status_idx" ON "SchoolSafeguardingAlert"("schoolId", "status");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_schoolId_severity_idx" ON "SchoolSafeguardingAlert"("schoolId", "severity");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_studentId_idx" ON "SchoolSafeguardingAlert"("studentId");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_createdAt_idx" ON "SchoolSafeguardingAlert"("createdAt");
