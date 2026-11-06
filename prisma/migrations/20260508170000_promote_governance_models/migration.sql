-- Promote governance metadata into dedicated relational models.

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sessionFamilyId" TEXT NOT NULL,
  "tokenId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "deviceFingerprint" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" DATETIME,
  "revokeReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AuthSession_tokenId_key" ON "AuthSession"("tokenId");
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");
CREATE INDEX "AuthSession_userId_createdAt_idx" ON "AuthSession"("userId", "createdAt");
CREATE INDEX "AuthSession_sessionFamilyId_idx" ON "AuthSession"("sessionFamilyId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AuthSession_revokedAt_idx" ON "AuthSession"("revokedAt");

CREATE TABLE "SchoolCommunicationPreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "parentSchoolLinkId" TEXT NOT NULL,
  "optedOutAt" DATETIME,
  "optOutReason" TEXT,
  "safeguardingLockedAt" DATETIME,
  "safeguardingLockReason" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SchoolCommunicationPreference_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SchoolCommunicationPreference_parentSchoolLinkId_fkey" FOREIGN KEY ("parentSchoolLinkId") REFERENCES "ParentSchoolLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SchoolCommunicationPreference_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SchoolCommunicationPreference_parentSchoolLinkId_key" ON "SchoolCommunicationPreference"("parentSchoolLinkId");
CREATE INDEX "SchoolCommunicationPreference_schoolId_updatedAt_idx" ON "SchoolCommunicationPreference"("schoolId", "updatedAt");
CREATE INDEX "SchoolCommunicationPreference_optedOutAt_idx" ON "SchoolCommunicationPreference"("optedOutAt");
CREATE INDEX "SchoolCommunicationPreference_safeguardingLockedAt_idx" ON "SchoolCommunicationPreference"("safeguardingLockedAt");

CREATE TABLE "SchoolCommunicationLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "parentSchoolLinkId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "channel" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "messageBody" TEXT NOT NULL,
  "deliveryStatus" TEXT NOT NULL,
  "deliveryReason" TEXT,
  "safeguardingOverride" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolCommunicationLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SchoolCommunicationLog_parentSchoolLinkId_fkey" FOREIGN KEY ("parentSchoolLinkId") REFERENCES "ParentSchoolLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SchoolCommunicationLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SchoolCommunicationLog_schoolId_createdAt_idx" ON "SchoolCommunicationLog"("schoolId", "createdAt");
CREATE INDEX "SchoolCommunicationLog_parentSchoolLinkId_createdAt_idx" ON "SchoolCommunicationLog"("parentSchoolLinkId", "createdAt");
CREATE INDEX "SchoolCommunicationLog_deliveryStatus_createdAt_idx" ON "SchoolCommunicationLog"("deliveryStatus", "createdAt");

ALTER TABLE "SafeguardingIncident" ADD COLUMN "escalationOwnerUserId" TEXT;
ALTER TABLE "SafeguardingIncident" ADD COLUMN "escalationLevel" TEXT;
CREATE INDEX "SafeguardingIncident_escalationOwnerUserId_createdAt_idx" ON "SafeguardingIncident"("escalationOwnerUserId", "createdAt");

CREATE TABLE "SafeguardingWorkflowEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "note" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafeguardingWorkflowEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SafeguardingWorkflowEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SafeguardingIncident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SafeguardingWorkflowEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SafeguardingWorkflowEvent_schoolId_createdAt_idx" ON "SafeguardingWorkflowEvent"("schoolId", "createdAt");
CREATE INDEX "SafeguardingWorkflowEvent_incidentId_createdAt_idx" ON "SafeguardingWorkflowEvent"("incidentId", "createdAt");
CREATE INDEX "SafeguardingWorkflowEvent_eventType_createdAt_idx" ON "SafeguardingWorkflowEvent"("eventType", "createdAt");

CREATE TABLE "SafeguardingEvidenceAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "uploadedByUserId" TEXT,
  "label" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedFilename" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafeguardingEvidenceAttachment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SafeguardingEvidenceAttachment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SafeguardingIncident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SafeguardingEvidenceAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SafeguardingEvidenceAttachment_schoolId_createdAt_idx" ON "SafeguardingEvidenceAttachment"("schoolId", "createdAt");
CREATE INDEX "SafeguardingEvidenceAttachment_incidentId_createdAt_idx" ON "SafeguardingEvidenceAttachment"("incidentId", "createdAt");
