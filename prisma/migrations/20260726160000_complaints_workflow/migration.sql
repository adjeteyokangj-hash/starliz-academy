-- Additive complaints operational workflow (Gate 2).
-- Non-destructive: create-only, no drops, no resets, no data changes.

CREATE TABLE IF NOT EXISTS "Complaint" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'admin',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'received',
    "schoolId" TEXT,
    "parentUserId" TEXT,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "substantiveRespondedAt" TIMESTAMP(3),
    "acknowledgementDueAt" TIMESTAMP(3),
    "substantiveResponseDueAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ComplaintNote" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'internal',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_reference_key" ON "Complaint"("reference");
CREATE INDEX IF NOT EXISTS "Complaint_status_substantiveResponseDueAt_idx"
  ON "Complaint"("status", "substantiveResponseDueAt");
CREATE INDEX IF NOT EXISTS "Complaint_assignedToUserId_status_idx"
  ON "Complaint"("assignedToUserId", "status");
CREATE INDEX IF NOT EXISTS "Complaint_schoolId_status_idx"
  ON "Complaint"("schoolId", "status");
CREATE INDEX IF NOT EXISTS "Complaint_priority_status_idx"
  ON "Complaint"("priority", "status");

CREATE INDEX IF NOT EXISTS "ComplaintNote_complaintId_createdAt_idx"
  ON "ComplaintNote"("complaintId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintNote_complaintId_fkey'
  ) THEN
    ALTER TABLE "ComplaintNote"
      ADD CONSTRAINT "ComplaintNote_complaintId_fkey"
      FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
