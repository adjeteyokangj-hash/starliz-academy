-- Reviewed additive hardening for server-only Coding records.
-- No learner rows or existing migration records are changed.
-- The trusted Prisma table owner continues to use scoped server-side APIs.
ALTER TABLE public."CodingWorkspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CodingProjectVersion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CodingWorkspace" FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public."CodingProjectVersion" FROM anon, authenticated, PUBLIC;
