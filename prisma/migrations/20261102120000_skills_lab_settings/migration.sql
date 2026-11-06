-- Additive only. Does not modify learner data or existing subscriptions.
CREATE TABLE "SkillsLabSettings" (
  "labId" TEXT NOT NULL,
  "humanAssistanceEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SkillsLabSettings_pkey" PRIMARY KEY ("labId")
);

-- Settings are accessed only by the server's privileged Prisma connection.
-- No browser/Data API policies are granted.
ALTER TABLE "SkillsLabSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SkillsLabSettings" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "SkillsLabSettings" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "SkillsLabSettings" FROM authenticated;
  END IF;
END $$;
