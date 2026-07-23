-- Daytime school timetable slots linked to classrooms / tutors / optional Lesson content.
CREATE TABLE "SchoolDayLesson" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classroomId" TEXT,
    "teacherId" TEXT,
    "lessonId" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lessonType" TEXT NOT NULL DEFAULT 'core',
    "yearGroup" TEXT,
    "keyStage" TEXT,
    "skillFocus" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "room" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDayLesson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolDayLesson_schoolId_dayOfWeek_periodIndex_idx" ON "SchoolDayLesson"("schoolId", "dayOfWeek", "periodIndex");
CREATE INDEX "SchoolDayLesson_classroomId_idx" ON "SchoolDayLesson"("classroomId");
CREATE INDEX "SchoolDayLesson_teacherId_idx" ON "SchoolDayLesson"("teacherId");
CREATE INDEX "SchoolDayLesson_lessonId_idx" ON "SchoolDayLesson"("lessonId");
CREATE INDEX "SchoolDayLesson_schoolId_status_idx" ON "SchoolDayLesson"("schoolId", "status");

ALTER TABLE "SchoolDayLesson" ADD CONSTRAINT "SchoolDayLesson_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolDayLesson" ADD CONSTRAINT "SchoolDayLesson_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolDayLesson" ADD CONSTRAINT "SchoolDayLesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "SchoolTeacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolDayLesson" ADD CONSTRAINT "SchoolDayLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
