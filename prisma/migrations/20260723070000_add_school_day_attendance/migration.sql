-- Additive daytime attendance register: one mark per student per SchoolDayLesson per calendar session date.
CREATE TABLE "SchoolDayAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolDayLessonId" TEXT NOT NULL,
    "schoolStudentId" TEXT NOT NULL,
    "classroomId" TEXT,
    "recordedByTeacherId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_recorded',
    "note" TEXT,
    "sessionDate" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDayAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolDayAttendance_schoolDayLessonId_schoolStudentId_sessionDate_key" ON "SchoolDayAttendance"("schoolDayLessonId", "schoolStudentId", "sessionDate");
CREATE INDEX "SchoolDayAttendance_schoolId_sessionDate_idx" ON "SchoolDayAttendance"("schoolId", "sessionDate");
CREATE INDEX "SchoolDayAttendance_schoolId_schoolDayLessonId_sessionDate_idx" ON "SchoolDayAttendance"("schoolId", "schoolDayLessonId", "sessionDate");
CREATE INDEX "SchoolDayAttendance_schoolStudentId_sessionDate_idx" ON "SchoolDayAttendance"("schoolStudentId", "sessionDate");
CREATE INDEX "SchoolDayAttendance_recordedByTeacherId_idx" ON "SchoolDayAttendance"("recordedByTeacherId");
CREATE INDEX "SchoolDayAttendance_classroomId_idx" ON "SchoolDayAttendance"("classroomId");

ALTER TABLE "SchoolDayAttendance" ADD CONSTRAINT "SchoolDayAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolDayAttendance" ADD CONSTRAINT "SchoolDayAttendance_schoolDayLessonId_fkey" FOREIGN KEY ("schoolDayLessonId") REFERENCES "SchoolDayLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolDayAttendance" ADD CONSTRAINT "SchoolDayAttendance_schoolStudentId_fkey" FOREIGN KEY ("schoolStudentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolDayAttendance" ADD CONSTRAINT "SchoolDayAttendance_recordedByTeacherId_fkey" FOREIGN KEY ("recordedByTeacherId") REFERENCES "SchoolTeacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
