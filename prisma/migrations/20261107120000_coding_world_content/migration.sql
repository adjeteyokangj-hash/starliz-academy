-- PREPARED ONLY: do not apply without separately authorised additive schema review.
-- No existing curriculum, learner records, workspaces or assessment tables change.
CREATE TABLE "CodingWorldContentVersion" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "dialogue" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "publishedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CodingWorldContentVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodingWorldContentVersion_status_check" CHECK ("status" IN ('draft','review','approved','published','archived')),
  CONSTRAINT "CodingWorldContentVersion_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "CodingWorldContentVersion_missionId_version_key" ON "CodingWorldContentVersion"("missionId", "version");
CREATE INDEX "CodingWorldContentVersion_missionId_status_idx" ON "CodingWorldContentVersion"("missionId", "status");
CREATE INDEX "CodingWorldContentVersion_status_updatedAt_idx" ON "CodingWorldContentVersion"("status", "updatedAt");
CREATE UNIQUE INDEX "CodingWorldContentVersion_one_published_mission" ON "CodingWorldContentVersion"("missionId") WHERE "status" = 'published';
ALTER TABLE "CodingWorldContentVersion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CodingWorldContentVersion" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "CodingWorldContentVersion" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "CodingWorldContentVersion" FROM authenticated; END IF;
END $$;
