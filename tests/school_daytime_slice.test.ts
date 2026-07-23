import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapDaytimeSchool,
  DAYTIME_PERIODS,
  SEED_STUDENTS,
  SEED_TUTORS,
  emptyBucket,
  studentExternalRef,
  type BootstrapDaytimeSchoolDeps,
} from "../src/lib/schools/bootstrap-daytime-school";
import {
  assignSchoolLesson,
  jsDayToSchoolDay,
  normalizeLessonType,
  type AssignSchoolLessonDeps,
} from "../src/lib/schools/assign-school-lesson";
import {
  updateSchoolDayLesson,
  type UpdateSchoolDayLessonDeps,
} from "../src/lib/schools/update-school-day-lesson";
import {
  getStudentDaytimeBoardScoped,
  getTutorDaytimeBoard,
  getTutorDaytimeBoardForSession,
  type StudentBoardDeps,
  type TutorBoardDeps,
} from "../src/lib/schools/daytime-timetable-queries";
import {
  describeSchoolClock,
  findCurrentPeriod,
  findNextPeriod,
  isValidTimeRange,
} from "../src/lib/schools/school-day-period";

function makeBootstrapStore() {
  const users = new Map<string, { id: string; email: string }>();
  const teachers = new Map<string, { id: string; schoolId: string; userId: string }>();
  const classrooms = new Map<string, { id: string; schoolId: string; name: string; teacherId: string | null }>();
  const students = new Map<string, {
    id: string;
    schoolId: string;
    externalRef: string;
    classroomId: string | null;
    status: string;
    childId: string;
  }>();
  const contentLessons = new Map<string, { id: string; title: string; subject: string; yearGroup: string; template: string }>();
  const dayLessons = new Map<string, {
    id: string;
    schoolId: string;
    classroomId: string;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
    subject: string;
  }>();
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;

  const deps: BootstrapDaytimeSchoolDeps = {
    findSchool: async () => ({
      id: "school-1",
      name: "UI Drill School",
      slug: "ui-drill",
      status: "pilot",
      licence: { id: "lic-1", seatLimit: 100, status: "active" },
      studentCount: students.size,
    }),
    ensureLicenceSeats: async () => undefined,
    activateSchoolIfNeeded: async () => undefined,
    findUserByEmail: async (email) => users.get(email) ?? null,
    createTeacherUser: async ({ email }) => {
      const row = { id: id("user"), email };
      users.set(email, row);
      return row;
    },
    upsertSchoolTeacher: async (input) => {
      const key = `${input.schoolId}:${input.userId}`;
      const existing = teachers.get(key);
      if (existing) return { id: existing.id, created: false };
      const row = { id: id("teacher"), schoolId: input.schoolId, userId: input.userId };
      teachers.set(key, row);
      return { id: row.id, created: true };
    },
    findClassroom: async ({ schoolId }) => {
      for (const row of classrooms.values()) {
        if (row.schoolId === schoolId && (row.name.includes("5K") || row.name === "5K")) return row;
      }
      return null;
    },
    createClassroom: async (input) => {
      const row = { id: id("class"), schoolId: input.schoolId, name: input.name, teacherId: input.teacherId };
      classrooms.set(row.id, row);
      return row;
    },
    updateClassroom: async (input) => {
      const row = classrooms.get(input.classroomId);
      if (row) row.teacherId = input.teacherId;
    },
    findSchoolStudentByExternalRef: async ({ schoolId, externalRef }) => {
      for (const row of students.values()) {
        if (row.schoolId === schoolId && row.externalRef === externalRef) return row;
      }
      return null;
    },
    enrolSchoolStudent: async (input) => {
      const schoolStudentId = id("ss");
      students.set(schoolStudentId, {
        id: schoolStudentId,
        schoolId: input.schoolId,
        externalRef: input.externalRef ?? "",
        classroomId: input.classroomId ?? null,
        status: "active",
        childId: id("child"),
      });
      return { ok: true, schoolStudentId, childId: "child", parentUserId: "parent" };
    },
    updateSchoolStudentEnrolment: async (input) => {
      const row = students.get(input.schoolStudentId);
      if (row) {
        row.classroomId = input.classroomId;
        row.status = input.status;
      }
    },
    findContentLesson: async (input) => {
      for (const row of contentLessons.values()) {
        if (
          row.title === input.title
          && row.subject === input.subject
          && row.yearGroup === input.yearGroup
          && row.template === input.template
        ) {
          return row;
        }
      }
      return null;
    },
    createContentLesson: async (input) => {
      const row = {
        id: id("lesson"),
        title: input.title,
        subject: input.subject,
        yearGroup: input.yearGroup,
        template: input.template,
      };
      contentLessons.set(row.id, row);
      return row;
    },
    findDayLesson: async (input) => {
      for (const row of dayLessons.values()) {
        if (
          row.schoolId === input.schoolId
          && row.classroomId === input.classroomId
          && row.dayOfWeek === input.dayOfWeek
          && row.startsAt === input.startsAt
          && row.endsAt === input.endsAt
          && row.subject === input.subject
        ) {
          return row;
        }
      }
      return null;
    },
    createDayLesson: async (input) => {
      const row = {
        id: id("day"),
        schoolId: input.schoolId,
        classroomId: input.classroomId,
        dayOfWeek: input.dayOfWeek,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        subject: input.subject,
      };
      dayLessons.set(row.id, row);
      return row;
    },
    writeSchoolAuditLog: async () => undefined,
    hashPassword: async () => "hash",
  };

  return { deps, users, teachers, classrooms, students, contentLessons, dayLessons };
}

test("bootstrap first run creates tutors, students, enrolments, and timetable", async () => {
  const store = makeBootstrapStore();
  const result = await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.tutors.created, SEED_TUTORS.length);
  assert.equal(result.summary.students.created, SEED_STUDENTS.length);
  assert.equal(result.summary.enrolments.created, SEED_STUDENTS.length);
  assert.equal(result.summary.dayLessons.created, DAYTIME_PERIODS.length * 5);
  assert.equal(store.teachers.size, SEED_TUTORS.length);
  assert.equal(store.students.size, SEED_STUDENTS.length);
  assert.equal(store.dayLessons.size, DAYTIME_PERIODS.length * 5);
});

test("bootstrap second run does not duplicate tutors, students, enrolments, or periods", async () => {
  const store = makeBootstrapStore();
  await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  const second = await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.summary.tutors.created, 0);
  assert.equal(second.summary.tutors.reused, SEED_TUTORS.length);
  assert.equal(second.summary.students.created, 0);
  assert.equal(second.summary.students.reused, SEED_STUDENTS.length);
  assert.equal(second.summary.enrolments.created, 0);
  assert.equal(second.summary.enrolments.reused, SEED_STUDENTS.length);
  assert.equal(second.summary.dayLessons.created, 0);
  assert.equal(second.summary.dayLessons.reused, DAYTIME_PERIODS.length * 5);
  assert.equal(store.teachers.size, SEED_TUTORS.length);
  assert.equal(store.students.size, SEED_STUDENTS.length);
  assert.equal(store.dayLessons.size, DAYTIME_PERIODS.length * 5);
  assert.equal(second.changed, false);
});

test("bootstrap restores missing timetable without duplicating roster", async () => {
  const store = makeBootstrapStore();
  await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  store.dayLessons.clear();
  const restored = await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(store.teachers.size, SEED_TUTORS.length);
  assert.equal(store.students.size, SEED_STUDENTS.length);
  assert.equal(store.dayLessons.size, DAYTIME_PERIODS.length * 5);
  assert.equal(restored.summary.dayLessons.restored, DAYTIME_PERIODS.length * 5);
  assert.equal(restored.summary.tutors.created, 0);
  assert.equal(restored.summary.students.created, 0);
});

test("bootstrap restores a single missing student enrolment safely", async () => {
  const store = makeBootstrapStore();
  await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  const missingKey = studentExternalRef(SEED_STUDENTS[0]!.admissionKey);
  for (const [id, row] of store.students.entries()) {
    if (row.externalRef === missingKey) store.students.delete(id);
  }
  assert.equal(store.students.size, SEED_STUDENTS.length - 1);
  const result = await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(store.students.size, SEED_STUDENTS.length);
  assert.equal(result.summary.students.created, 1);
  assert.equal(result.summary.students.reused, SEED_STUDENTS.length - 1);
  assert.equal(result.summary.enrolments.created, 1);
});

test("bootstrap restores enrolment class assignment without recreating the student", async () => {
  const store = makeBootstrapStore();
  await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  const student = [...store.students.values()][0]!;
  student.classroomId = "other-class";
  student.status = "archived";
  const result = await bootstrapDaytimeSchool({ schoolId: "school-1", actorUserId: "admin" }, store.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.students.created, 0);
  assert.equal(result.summary.enrolments.restored, 1);
  assert.equal(student.status, "active");
  assert.ok(student.classroomId);
  assert.notEqual(student.classroomId, "other-class");
});

test("updateSchoolDayLesson persists tutor, room, and time", async () => {
  const row: {
    id: string;
    schoolId: string;
    teacherId: string | null;
    room: string | null;
    startsAt: string;
    endsAt: string;
    subject: string;
    title: string;
    lessonId: string | null;
  } = {
    id: "day-1",
    schoolId: "school-1",
    teacherId: "teacher-1",
    room: "Room 12",
    startsAt: "09:00",
    endsAt: "09:50",
    subject: "Maths",
    title: "Maths",
    lessonId: null,
  };
  const deps: UpdateSchoolDayLessonDeps = {
    findDayLesson: async () => row,
    findTeacherInSchool: async () => ({ id: "teacher-2" }),
    findLesson: async () => null,
    updateDayLesson: async (input) => {
      if (input.teacherId !== undefined) row.teacherId = input.teacherId;
      if (input.room !== undefined) row.room = input.room;
      if (input.startsAt !== undefined) row.startsAt = input.startsAt;
      if (input.endsAt !== undefined) row.endsAt = input.endsAt;
    },
    writeSchoolAuditLog: async () => undefined,
  };
  const result = await updateSchoolDayLesson({
    schoolId: "school-1",
    dayLessonId: "day-1",
    actorUserId: "admin",
    teacherId: "teacher-2",
    room: "Hall",
    startsAt: "10:00",
    endsAt: "10:45",
  }, deps);
  assert.equal(result.ok, true);
  assert.equal(row.teacherId, "teacher-2");
  assert.equal(row.room, "Hall");
  assert.equal(row.startsAt, "10:00");
  assert.equal(row.endsAt, "10:45");
});

test("updateSchoolDayLesson rejects invalid time ranges", async () => {
  const result = await updateSchoolDayLesson(
    {
      schoolId: "school-1",
      dayLessonId: "day-1",
      actorUserId: "admin",
      startsAt: "11:00",
      endsAt: "10:00",
    },
    {
      findDayLesson: async () => ({
        id: "day-1",
        schoolId: "school-1",
        teacherId: null,
        room: null,
        startsAt: "09:00",
        endsAt: "09:50",
        subject: "Maths",
        title: "Maths",
        lessonId: null,
      }),
      findTeacherInSchool: async () => ({ id: "t" }),
      findLesson: async () => null,
      updateDayLesson: async () => {
        throw new Error("should not update");
      },
      writeSchoolAuditLog: async () => undefined,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /end time/i);
  }
  assert.equal(isValidTimeRange("11:00", "10:00"), false);
});

test("updateSchoolDayLesson rejects cross-school tutor assignment", async () => {
  const result = await updateSchoolDayLesson(
    {
      schoolId: "school-1",
      dayLessonId: "day-1",
      actorUserId: "admin",
      teacherId: "foreign-teacher",
    },
    {
      findDayLesson: async () => ({
        id: "day-1",
        schoolId: "school-1",
        teacherId: null,
        room: null,
        startsAt: "09:00",
        endsAt: "09:50",
        subject: "Maths",
        title: "Maths",
        lessonId: null,
      }),
      findTeacherInSchool: async () => null,
      findLesson: async () => null,
      updateDayLesson: async () => {
        throw new Error("should not update");
      },
      writeSchoolAuditLog: async () => undefined,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /does not belong/i);
  }
});

function periodRow(input: {
  id: string;
  teacherId: string;
  classroomId: string;
  startsAt: string;
  endsAt: string;
  title?: string;
}): Parameters<TutorBoardDeps["findTutorPeriods"]> extends never ? never : Awaited<ReturnType<TutorBoardDeps["findTutorPeriods"]>>[number] {
  return {
    id: input.id,
    title: input.title ?? input.id,
    subject: "Maths",
    lessonType: "core",
    dayOfWeek: 1,
    periodIndex: 1,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    room: "Room 1",
    status: "scheduled",
    classroomId: input.classroomId,
    skillFocus: null,
    lessonId: null,
    classroom: { id: input.classroomId, name: "5K" },
    teacher: { id: input.teacherId, user: { name: "Tutor" } },
    lesson: null,
  };
}

test("tutor query returns only that tutor's periods", async () => {
  const deps: TutorBoardDeps = {
    findTutorPeriods: async () => [
      periodRow({ id: "mine", teacherId: "teacher-1", classroomId: "class-1", startsAt: "09:00", endsAt: "09:50" }),
      periodRow({ id: "theirs", teacherId: "teacher-2", classroomId: "class-1", startsAt: "10:00", endsAt: "10:50" }),
    ],
    findClassroomStudents: async () => [],
  };
  const board = await getTutorDaytimeBoard({
    schoolId: "school-1",
    schoolTeacherId: "teacher-1",
    dayOfWeek: 1,
  }, deps);
  assert.deepEqual(board.periods.map((row) => row.id), ["mine"]);
});

test("tutor cannot access another tutor's schedule via teacherId param", async () => {
  const result = await getTutorDaytimeBoardForSession({
    schoolId: "school-1",
    schoolTeacherId: "teacher-1",
    requestedTeacherId: "teacher-2",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
  }
});

test("student query returns only enrolled class timetable", async () => {
  const deps: StudentBoardDeps = {
    findActiveEnrolment: async () => ({
      id: "ss-1",
      schoolId: "school-1",
      classroomId: "class-1",
      classroomName: "5K",
      schoolName: "UI Drill",
    }),
    findClassPeriods: async () => [
      periodRow({ id: "class-1-maths", teacherId: "t1", classroomId: "class-1", startsAt: "09:00", endsAt: "09:50" }),
      periodRow({ id: "class-2-maths", teacherId: "t1", classroomId: "class-2", startsAt: "09:00", endsAt: "09:50" }),
    ],
  };
  const result = await getStudentDaytimeBoardScoped({ childId: "child-1", dayOfWeek: 1 }, deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.board.periods.map((row) => row.id), ["class-1-maths"]);
});

test("student cannot access another class or school via query params", async () => {
  const deps: StudentBoardDeps = {
    findActiveEnrolment: async () => ({
      id: "ss-1",
      schoolId: "school-1",
      classroomId: "class-1",
      classroomName: "5K",
      schoolName: "UI Drill",
    }),
    findClassPeriods: async () => [],
  };
  const classDenied = await getStudentDaytimeBoardScoped({
    childId: "child-1",
    requestedClassroomId: "class-2",
  }, deps);
  assert.equal(classDenied.ok, false);
  if (!classDenied.ok) assert.equal(classDenied.status, 403);

  const schoolDenied = await getStudentDaytimeBoardScoped({
    childId: "child-1",
    requestedSchoolId: "school-2",
  }, deps);
  assert.equal(schoolDenied.ok, false);
  if (!schoolDenied.ok) assert.equal(schoolDenied.status, 403);
});

test("current and next period logic works before school, during lessons, lunch, and after school", () => {
  const periods = [
    { id: "reg", startsAt: "08:45", endsAt: "09:00" },
    { id: "english", startsAt: "09:00", endsAt: "09:50" },
    { id: "lunch", startsAt: "11:45", endsAt: "12:30" },
    { id: "pe", startsAt: "14:10", endsAt: "15:00" },
  ];

  const before = describeSchoolClock(periods, 8 * 60); // 08:00
  assert.equal(before.phase, "before_school");
  assert.equal(before.current, null);
  assert.equal(before.next?.id, "reg");

  const during = describeSchoolClock(periods, 9 * 60 + 10); // 09:10
  assert.equal(during.phase, "in_session");
  assert.equal(during.current?.id, "english");
  assert.equal(during.next?.id, "lunch");

  const lunch = describeSchoolClock(periods, 12 * 60); // 12:00
  assert.equal(lunch.current?.id, "lunch");
  assert.equal(findCurrentPeriod(periods, 12 * 60)?.id, "lunch");
  assert.equal(findNextPeriod(periods, 12 * 60)?.id, "pe");

  const after = describeSchoolClock(periods, 16 * 60); // 16:00
  assert.equal(after.phase, "after_school");
  assert.equal(after.current, null);
  assert.equal(after.next, null);
});

test("assignSchoolLesson helpers remain stable", () => {
  assert.equal(normalizeLessonType("Intervention"), "intervention");
  assert.equal(jsDayToSchoolDay(new Date("2026-07-25T12:00:00Z")), 1);
  assert.equal(typeof assignSchoolLesson, "function");
  assert.equal(emptyBucket().created, 0);
  const deps: AssignSchoolLessonDeps = {
    findSchool: async () => ({ id: "school-1" }),
    findClassroom: async () => ({ id: "class-1", teacherId: null }),
    findTeacher: async () => ({ id: "t1" }),
    createLesson: async () => ({ id: "l1" }),
    createDayLesson: async () => ({ id: "d1" }),
    writeSchoolAuditLog: async () => undefined,
  };
  void deps;
});
