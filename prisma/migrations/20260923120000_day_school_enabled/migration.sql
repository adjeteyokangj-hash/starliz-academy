-- School-level and per-student Day School switches.
-- Defaults keep current schools and enrolments on Day School until an admin turns them off.
-- Does not delete students, classrooms, bookings, or attendance history.
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "daySchoolEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SchoolStudent" ADD COLUMN IF NOT EXISTS "daySchoolEnabled" BOOLEAN NOT NULL DEFAULT true;
