import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRegisterCompletion,
  summariseAttendanceStatuses,
} from "../src/lib/schools/attendance-completion";
import {
  isActivelyEnrolledOnDate,
  resolveActiveClassRoster,
  type EnrolmentRow,
} from "../src/lib/schools/attendance-roster";
import {
  loadAttendanceRegister,
  saveAttendanceRegister,
  getAdminDayAttendanceSummary,
  getStudentAttendanceHistory,
  type AttendanceRegisterDeps,
  type AttendanceRow,
  type PeriodForRegister,
  type AdminSummaryDeps,
  type StudentHistoryDeps,
} from "../src/lib/schools/attendance-register";
import {
  isAttendanceStatus,
  isRegisterEligibleLessonType,
  parseSessionDateInput,
  type AttendanceStatus,
} from "../src/lib/schools/attendance-status";

function makePeriod(overrides: Partial<PeriodForRegister> = {}): PeriodForRegister {
  return {
    id: "period-1",
    schoolId: "school-1",
    classroomId: "class-1",
    teacherId: "teacher-1",
    title: "English",
    subject: "English",
    lessonType: "core",
    dayOfWeek: 1,
    periodIndex: 2,
    startsAt: "09:00",
    endsAt: "09:50",
    room: "Room 12",
    status: "scheduled",
    classroom: { id: "class-1", name: "5K" },
    teacher: { id: "teacher-1", user: { name: "Ms Khan" } },
    ...overrides,
  };
}

function makeStudent(id: string, name: string, overrides: Partial<EnrolmentRow> = {}): EnrolmentRow {
  return {
    id,
    schoolId: "school-1",
    classroomId: "class-1",
    status: "active",
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    leftAt: null,
    child: { id: `child-${id}`, name },
    ...overrides,
  };
}

function makeStore(input: {
  period: PeriodForRegister;
  students: EnrolmentRow[];
  rows?: AttendanceRow[];
}) {
  const attendance = new Map<string, AttendanceRow>();
  for (const row of input.rows ?? []) {
    attendance.set(row.schoolStudentId, { ...row });
  }
  let seq = 0;

  const deps: AttendanceRegisterDeps = {
    findPeriod: async (id) => (id === input.period.id ? input.period : null),
    findClassroomStudents: async ({ schoolId, classroomId }) =>
      input.students.filter((row) => row.schoolId === schoolId && row.classroomId === classroomId),
    findAttendanceRows: async ({ schoolDayLessonId, sessionDate }) => {
      if (schoolDayLessonId !== input.period.id) return [];
      void sessionDate;
      return [...attendance.values()];
    },
    findStudentsByIds: async (ids) =>
      input.students
        .filter((row) => ids.includes(row.id))
        .map((row) => ({
          id: row.id,
          schoolId: row.schoolId,
          classroomId: row.classroomId,
          child: row.child,
        })),
    upsertAttendance: async (payload) => {
      const existing = attendance.get(payload.schoolStudentId);
      const next: AttendanceRow = {
        id: existing?.id ?? `att-${++seq}`,
        schoolStudentId: payload.schoolStudentId,
        classroomId: payload.classroomId,
        status: payload.status,
        note: payload.note,
        recordedAt: new Date(),
        updatedAt: new Date(),
        recordedByTeacherId: payload.recordedByTeacherId,
      };
      attendance.set(payload.schoolStudentId, next);
      return next;
    },
  };

  return { deps, attendance };
}

test("isRegisterEligibleLessonType rejects break and lunch", () => {
  assert.equal(isRegisterEligibleLessonType("break"), false);
  assert.equal(isRegisterEligibleLessonType("lunch"), false);
  assert.equal(isRegisterEligibleLessonType("core"), true);
  assert.equal(isRegisterEligibleLessonType("registration"), true);
});

test("register completion: not_started, partial, complete, no_roster", () => {
  assert.equal(calculateRegisterCompletion([]), "no_roster");
  assert.equal(calculateRegisterCompletion(["not_recorded", "not_recorded"]), "not_started");
  assert.equal(calculateRegisterCompletion(["present", "not_recorded"]), "partial");
  assert.equal(calculateRegisterCompletion(["present", "absent", "late"]), "complete");
});

test("summariseAttendanceStatuses counts persisted statuses only", () => {
  const summary = summariseAttendanceStatuses([
    "present",
    "absent",
    "late",
    "authorised_absence",
    "medical",
    "not_recorded",
  ]);
  assert.equal(summary.totalStudents, 6);
  assert.equal(summary.present, 1);
  assert.equal(summary.absent, 1);
  assert.equal(summary.late, 1);
  assert.equal(summary.authorisedAbsence, 1);
  assert.equal(summary.medical, 1);
  assert.equal(summary.notRecorded, 1);
  assert.equal(summary.completion, "partial");
});

test("unique attendance key behaviour: re-saving updates rather than duplicates", async () => {
  const students = [makeStudent("s1", "Ada"), makeStudent("s2", "Ben")];
  const { deps, attendance } = makeStore({ period: makePeriod(), students });

  const first = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    sessionDate: "2026-07-20",
    mode: "draft",
    entries: [{ schoolStudentId: "s1", status: "present" }],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(first.ok, true);
  assert.equal(attendance.size, 1);

  const second = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    sessionDate: "2026-07-20",
    mode: "draft",
    entries: [{ schoolStudentId: "s1", status: "late", note: "Arrived 09:10" }],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(second.ok, true);
  assert.equal(attendance.size, 1);
  assert.equal(attendance.get("s1")?.status, "late");
  assert.equal(attendance.get("s1")?.note, "Arrived 09:10");
});

test("tutor can access assigned register; other tutor cannot", async () => {
  const students = [makeStudent("s1", "Ada")];
  const { deps } = makeStore({ period: makePeriod(), students });

  const own = await loadAttendanceRegister({
    schoolDayLessonId: "period-1",
    expectedSchoolId: "school-1",
    expectedTeacherId: "teacher-1",
  }, deps);
  assert.equal(own.ok, true);

  const other = await loadAttendanceRegister({
    schoolDayLessonId: "period-1",
    expectedSchoolId: "school-1",
    expectedTeacherId: "teacher-2",
  }, deps);
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.status, 403);
});

test("cross-school access is rejected", async () => {
  const { deps } = makeStore({ period: makePeriod(), students: [makeStudent("s1", "Ada")] });
  const loaded = await loadAttendanceRegister({
    schoolDayLessonId: "period-1",
    expectedSchoolId: "school-other",
  }, deps);
  assert.equal(loaded.ok, false);
  if (!loaded.ok) assert.equal(loaded.status, 403);

  const saved = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    mode: "draft",
    entries: [{ schoolStudentId: "s1", status: "present" }],
    actor: { schoolId: "school-other", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(saved.ok, false);
  if (!saved.ok) assert.equal(saved.status, 403);
});

test("only students in the correct class roster are accepted", async () => {
  const students = [
    makeStudent("s1", "Ada"),
    makeStudent("s2", "Ben", { classroomId: "class-2", schoolId: "school-1" }),
    makeStudent("s3", "Cara", { schoolId: "school-2", classroomId: "class-1" }),
  ];
  const { deps } = makeStore({ period: makePeriod(), students });

  const rejected = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    mode: "draft",
    entries: [{ schoolStudentId: "s2", status: "present" }],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.status, 403);

  const ok = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    mode: "draft",
    entries: [{ schoolStudentId: "s1", status: "present" }],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(ok.ok, true);
});

test("student cannot view another student's attendance", async () => {
  const deps: StudentHistoryDeps = {
    findActiveEnrolment: async (childId) =>
      childId === "child-a" ? { id: "ss-a", schoolId: "school-1" } : null,
    findAttendanceForStudent: async () => [],
  };

  const denied = await getStudentAttendanceHistory({
    childId: "child-a",
    expectedSchoolStudentId: "ss-b",
  }, deps);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 403);

  const allowed = await getStudentAttendanceHistory({
    childId: "child-a",
    expectedSchoolStudentId: "ss-a",
  }, deps);
  assert.equal(allowed.ok, true);
});

test("admin summaries use persisted attendance rows", async () => {
  const students = [makeStudent("s1", "Ada"), makeStudent("s2", "Ben")];
  const { deps, attendance } = makeStore({ period: makePeriod(), students });
  await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    sessionDate: "2026-07-20",
    mode: "draft",
    entries: [
      { schoolStudentId: "s1", status: "present" },
      { schoolStudentId: "s2", status: "absent" },
    ],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(attendance.size, 2);

  const adminDeps: AdminSummaryDeps = {
    findPeriodsForDay: async () => [makePeriod()],
    loadRegister: loadAttendanceRegister,
  };
  const summary = await getAdminDayAttendanceSummary(
    { schoolId: "school-1", sessionDate: "2026-07-20" },
    adminDeps,
    deps,
  );
  assert.equal(summary.periods.length, 1);
  assert.equal(summary.periods[0].summary.present, 1);
  assert.equal(summary.periods[0].summary.absent, 1);
  assert.equal(summary.periods[0].summary.totalStudents, 2);
  assert.equal(summary.periods[0].completion, "complete");
});

test("mark-all-present persists the full roster", async () => {
  const students = [makeStudent("s1", "Ada"), makeStudent("s2", "Ben"), makeStudent("s3", "Cara")];
  const { deps, attendance } = makeStore({ period: makePeriod(), students });

  const result = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    mode: "mark_all_present",
    entries: [],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(result.ok, true);
  assert.equal(attendance.size, 3);
  for (const row of attendance.values()) {
    assert.equal(row.status, "present");
  }
  if (result.ok) {
    assert.equal(result.register.completion, "complete");
    assert.equal(result.register.summary.present, 3);
  }
});

test("historical records remain when enrolment later changes", async () => {
  const sessionDate = parseSessionDateInput("2026-07-20");
  const students = [
    makeStudent("s1", "Ada"),
    makeStudent("s2", "Ben", {
      status: "active",
      classroomId: "class-other",
      leftAt: null,
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  ];
  const existing: AttendanceRow[] = [{
    id: "att-s2",
    schoolStudentId: "s2",
    classroomId: "class-1",
    status: "present",
    note: null,
    recordedAt: new Date("2026-07-20T09:05:00.000Z"),
    updatedAt: new Date("2026-07-20T09:05:00.000Z"),
    recordedByTeacherId: "teacher-1",
  }];
  const { deps } = makeStore({ period: makePeriod(), students, rows: existing });

  const loaded = await loadAttendanceRegister({
    schoolDayLessonId: "period-1",
    sessionDate,
    expectedSchoolId: "school-1",
    expectedTeacherId: "teacher-1",
  }, deps);
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    const historical = loaded.register.students.find((row) => row.schoolStudentId === "s2");
    assert.ok(historical);
    assert.equal(historical?.historicalOnly, true);
    assert.equal(historical?.status, "present");
    assert.equal(loaded.register.students.some((row) => row.schoolStudentId === "s1" && row.onCurrentRoster), true);
  }
});

test("break and lunch periods do not incorrectly create registers", async () => {
  const breakPeriod = makePeriod({ lessonType: "break", title: "Break" });
  const { deps, attendance } = makeStore({
    period: breakPeriod,
    students: [makeStudent("s1", "Ada")],
  });

  const loaded = await loadAttendanceRegister({
    schoolDayLessonId: "period-1",
    expectedTeacherId: "teacher-1",
    expectedSchoolId: "school-1",
  }, deps);
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.register.registerEligible, false);
    assert.equal(loaded.register.completion, "not_applicable");
    assert.equal(loaded.register.students.length, 0);
  }

  const saved = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    mode: "mark_all_present",
    entries: [],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(saved.ok, false);
  if (!saved.ok) assert.equal(saved.status, 400);
  assert.equal(attendance.size, 0);
});

test("invalid statuses and malformed submissions are rejected", async () => {
  const { deps } = makeStore({
    period: makePeriod(),
    students: [makeStudent("s1", "Ada")],
  });

  assert.equal(isAttendanceStatus("present"), true);
  assert.equal(isAttendanceStatus("nope"), false);

  const invalid = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    mode: "draft",
    entries: [{ schoolStudentId: "s1", status: "present" }, { schoolStudentId: "s1", status: "ghost" as AttendanceStatus }],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  // ghost fails isAttendanceStatus in the loop
  assert.equal(invalid.ok, false);

  const empty = await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    mode: "draft",
    entries: [],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.status, 400);
});

test("active roster uses joinedAt/leftAt on session date", () => {
  const day = parseSessionDateInput("2026-07-20");
  const active = makeStudent("s1", "Ada");
  assert.equal(isActivelyEnrolledOnDate(active, day), true);

  const left = makeStudent("s2", "Ben", { leftAt: new Date("2026-07-19T00:00:00.000Z") });
  assert.equal(isActivelyEnrolledOnDate(left, day), false);

  const future = makeStudent("s3", "Cara", { joinedAt: new Date("2026-07-21T00:00:00.000Z") });
  assert.equal(isActivelyEnrolledOnDate(future, day), false);

  const roster = resolveActiveClassRoster({
    schoolId: "school-1",
    classroomId: "class-1",
    sessionDate: day,
    students: [active, left, future, makeStudent("s4", "Dan", { schoolId: "school-2" })],
  });
  assert.deepEqual(roster.map((row) => row.id), ["s1"]);
});

test("one attendance record per student per SchoolDayLesson session (unique map)", async () => {
  const students = [makeStudent("s1", "Ada")];
  const { deps, attendance } = makeStore({ period: makePeriod(), students });
  await saveAttendanceRegister({
    schoolDayLessonId: "period-1",
    sessionDate: "2026-07-20",
    mode: "draft",
    entries: [
      { schoolStudentId: "s1", status: "absent" },
      { schoolStudentId: "s1", status: "present" },
    ],
    actor: { schoolId: "school-1", schoolTeacherId: "teacher-1", role: "tutor" },
  }, deps);
  assert.equal(attendance.size, 1);
  assert.equal(attendance.get("s1")?.status, "present");
});
