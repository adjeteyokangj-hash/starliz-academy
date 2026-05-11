-- AlterTable
ALTER TABLE "SchoolAuditLog" ADD COLUMN "actorAdminUserId" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "actorEmail" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "actorSchoolTeacherId" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "actorType" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "afterJson" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "beforeJson" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "diffJson" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "impersonatedByUserId" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "operation" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "source" TEXT;
ALTER TABLE "SchoolAuditLog" ADD COLUMN "tagsJson" TEXT;

-- CreateTable
CREATE TABLE "SchoolProvisioningJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "idempotencyKey" TEXT NOT NULL,
    "requestJson" TEXT,
    "resultJson" TEXT,
    "errorJson" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchoolProvisioningJob_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolProvisioningJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolProvisioningStepRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "actorUserId" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "errorJson" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchoolProvisioningStepRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SchoolProvisioningJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolProvisioningStepRun_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trust" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "headquartersRegion" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrustSchoolMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trustId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "roleInTrust" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrustSchoolMembership_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "Trust" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrustSchoolMembership_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrustAdminMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trustId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trustRole" TEXT NOT NULL DEFAULT 'viewer',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrustAdminMembership_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "Trust" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrustAdminMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BulkOnboardingBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trustId" TEXT,
    "createdByUserId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'csv',
    "fileRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BulkOnboardingBatch_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "Trust" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BulkOnboardingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "schoolPayloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdSchoolId" TEXT,
    "errorJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BulkOnboardingItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BulkOnboardingBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "schoolId" TEXT,
    "trustId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "payloadJson" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NotificationEvent_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "Trust" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "lastError" TEXT,
    "deliveredByUserId" TEXT,
    "sentAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationDelivery_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT,
    "trustId" TEXT,
    "eventType" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minSeverity" TEXT NOT NULL DEFAULT 'info',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "timezone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "Trust" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SafeguardingIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "reportedByUserId" TEXT,
    "escalationOwnerUserId" TEXT,
    "escalationLevel" TEXT,
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
    CONSTRAINT "SafeguardingIncident_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SafeguardingIncident_escalationOwnerUserId_fkey" FOREIGN KEY ("escalationOwnerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SafeguardingIncident" ("actionTaken", "category", "createdAt", "description", "escalationLevel", "escalationOwnerUserId", "id", "metadataJson", "reportedByUserId", "resolvedAt", "schoolId", "severity", "status", "studentId", "updatedAt") SELECT "actionTaken", "category", "createdAt", "description", "escalationLevel", "escalationOwnerUserId", "id", "metadataJson", "reportedByUserId", "resolvedAt", "schoolId", "severity", "status", "studentId", "updatedAt" FROM "SafeguardingIncident";
DROP TABLE "SafeguardingIncident";
ALTER TABLE "new_SafeguardingIncident" RENAME TO "SafeguardingIncident";
CREATE INDEX "SafeguardingIncident_schoolId_status_idx" ON "SafeguardingIncident"("schoolId", "status");
CREATE INDEX "SafeguardingIncident_schoolId_severity_idx" ON "SafeguardingIncident"("schoolId", "severity");
CREATE INDEX "SafeguardingIncident_studentId_createdAt_idx" ON "SafeguardingIncident"("studentId", "createdAt");
CREATE INDEX "SafeguardingIncident_reportedByUserId_createdAt_idx" ON "SafeguardingIncident"("reportedByUserId", "createdAt");
CREATE INDEX "SafeguardingIncident_escalationOwnerUserId_createdAt_idx" ON "SafeguardingIncident"("escalationOwnerUserId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SchoolProvisioningJob_idempotencyKey_key" ON "SchoolProvisioningJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SchoolProvisioningJob_schoolId_createdAt_idx" ON "SchoolProvisioningJob"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolProvisioningJob_status_createdAt_idx" ON "SchoolProvisioningJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolProvisioningJob_nextRetryAt_status_idx" ON "SchoolProvisioningJob"("nextRetryAt", "status");

-- CreateIndex
CREATE INDEX "SchoolProvisioningStepRun_jobId_createdAt_idx" ON "SchoolProvisioningStepRun"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolProvisioningStepRun_stepKey_status_idx" ON "SchoolProvisioningStepRun"("stepKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Trust_code_key" ON "Trust"("code");

-- CreateIndex
CREATE INDEX "Trust_status_createdAt_idx" ON "Trust"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TrustSchoolMembership_schoolId_status_idx" ON "TrustSchoolMembership"("schoolId", "status");

-- CreateIndex
CREATE INDEX "TrustSchoolMembership_trustId_status_idx" ON "TrustSchoolMembership"("trustId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrustSchoolMembership_trustId_schoolId_key" ON "TrustSchoolMembership"("trustId", "schoolId");

-- CreateIndex
CREATE INDEX "TrustAdminMembership_userId_status_idx" ON "TrustAdminMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "TrustAdminMembership_trustId_status_idx" ON "TrustAdminMembership"("trustId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrustAdminMembership_trustId_userId_key" ON "TrustAdminMembership"("trustId", "userId");

-- CreateIndex
CREATE INDEX "BulkOnboardingBatch_status_createdAt_idx" ON "BulkOnboardingBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOnboardingBatch_trustId_createdAt_idx" ON "BulkOnboardingBatch"("trustId", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOnboardingItem_status_createdAt_idx" ON "BulkOnboardingItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOnboardingItem_createdSchoolId_idx" ON "BulkOnboardingItem"("createdSchoolId");

-- CreateIndex
CREATE UNIQUE INDEX "BulkOnboardingItem_batchId_rowNumber_key" ON "BulkOnboardingItem"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "NotificationEvent_eventType_createdAt_idx" ON "NotificationEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_schoolId_createdAt_idx" ON "NotificationEvent"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_trustId_createdAt_idx" ON "NotificationEvent"("trustId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_status_createdAt_idx" ON "NotificationEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_dedupeKey_idx" ON "NotificationEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_eventId_createdAt_idx" ON "NotificationDelivery"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_createdAt_idx" ON "NotificationDelivery"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipient_createdAt_idx" ON "NotificationDelivery"("recipient", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_createdAt_idx" ON "NotificationPreference"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_schoolId_userId_idx" ON "NotificationPreference"("schoolId", "userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_trustId_userId_idx" ON "NotificationPreference"("trustId", "userId");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_schoolId_operation_createdAt_idx" ON "SchoolAuditLog"("schoolId", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_correlationId_idx" ON "SchoolAuditLog"("correlationId");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_actorUserId_createdAt_idx" ON "SchoolAuditLog"("actorUserId", "createdAt");
