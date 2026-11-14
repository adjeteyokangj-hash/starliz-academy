-- Additive coding workspace. Does not modify or delete existing learner data.

CREATE TABLE "CodingWorkspace" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "yearGroup" TEXT,
    "pathwayId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'discover',
    "programsJson" TEXT NOT NULL DEFAULT '{}',
    "undoJson" TEXT NOT NULL DEFAULT '{}',
    "completedStagesJson" TEXT NOT NULL DEFAULT '[]',
    "evidenceJson" TEXT NOT NULL DEFAULT '{}',
    "hintCountsJson" TEXT NOT NULL DEFAULT '{}',
    "skillStatus" TEXT NOT NULL DEFAULT 'not_started',
    "lastFeedback" TEXT,
    "lastRunJson" TEXT,
    "teacherFeedback" TEXT,
    "privateProject" BOOLEAN NOT NULL DEFAULT true,
    "rewardFlagsJson" TEXT NOT NULL DEFAULT '{}',
    "assignmentStatus" TEXT NOT NULL DEFAULT 'available',
    "supportHandoffJson" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "checksPassed" INTEGER NOT NULL DEFAULT 0,
    "placementJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodingProjectVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "programJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodingProjectVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodingWorkspace_childId_lessonId_key" ON "CodingWorkspace"("childId", "lessonId");
CREATE INDEX "CodingWorkspace_childId_skillStatus_idx" ON "CodingWorkspace"("childId", "skillStatus");
CREATE INDEX "CodingWorkspace_skillStatus_idx" ON "CodingWorkspace"("skillStatus");
CREATE INDEX "CodingProjectVersion_workspaceId_createdAt_idx" ON "CodingProjectVersion"("workspaceId", "createdAt");

ALTER TABLE "CodingWorkspace" ADD CONSTRAINT "CodingWorkspace_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingProjectVersion" ADD CONSTRAINT "CodingProjectVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "CodingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
