import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findDaySchoolConflicts,
  formatBlockingConflictError,
  hmRangesOverlap,
} from "../src/lib/schools/day-school-conflicts";
import { deriveSchoolOpsAlerts, SCHOOL_OPS_LIMITATIONS, type SchoolOpsSignalCounts } from "../src/lib/schools/school-ops-overview";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("adjacent periods do not overlap", () => {
  assert.equal(hmRangesOverlap("09:00", "10:00", "10:00", "11:00"), false);
  assert.equal(hmRangesOverlap("09:00", "10:00", "09:30", "10:30"), true);
});

test("teacher and classroom overlaps are blocking; room is warning only", () => {
  const conflicts = findDaySchoolConflicts([
    {
      id: "a",
      dayOfWeek: 1,
      startsAt: "09:00",
      endsAt: "10:00",
      teacherId: "t1",
      classroomId: "c1",
      room: "Hall",
    },
    {
      id: "b",
      dayOfWeek: 1,
      startsAt: "09:30",
      endsAt: "10:30",
      teacherId: "t1",
      classroomId: "c2",
      room: "hall",
    },
    {
      id: "c",
      dayOfWeek: 1,
      startsAt: "09:15",
      endsAt: "09:45",
      teacherId: "t2",
      classroomId: "c1",
      room: "Lab",
    },
  ]);
  assert.equal(conflicts.some((x) => x.kind === "teacher" && x.severity === "blocking"), true);
  assert.equal(conflicts.some((x) => x.kind === "classroom" && x.severity === "blocking"), true);
  assert.equal(conflicts.some((x) => x.kind === "room" && x.severity === "warning"), true);
  assert.equal(conflicts.every((x) => x.kind !== "room" || x.severity === "warning"), true);
  assert.match(formatBlockingConflictError(conflicts.filter((x) => x.severity === "blocking")), /teacher|class/i);
});

test("updateSchoolDayLesson hard-blocks teacher/classroom clashes", () => {
  const src = read("src/lib/schools/update-school-day-lesson.ts");
  assert.match(src, /findDaySchoolConflicts/);
  assert.match(src, /status: 409/);
  assert.match(src, /formatBlockingConflictError/);
  assert.match(src, /warnings/);
});

test("ops overview surfaces conflict alerts and drops conflict limitation", () => {
  assert.equal(SCHOOL_OPS_LIMITATIONS.some((l) => /timetable conflicts are not detected/i.test(l)), false);
  const alerts = deriveSchoolOpsAlerts({
    unassignedClasses: 0,
    emptyClasses: 0,
    studentsWithoutClass: 0,
    studentsWithoutGuardian: 0,
    pendingInvitesOlderThan7Days: 0,
    expiredUnusedInvites: 0,
    awaitingReview: 0,
    machineFailed: 0,
    registersNotStarted: 0,
    missingTutorRegisters: 0,
    coverageGapMinutes: 0,
    changesNeedingReview: 0,
    timetableConflictBlocking: 2,
    timetableRoomWarnings: 1,
    includeSafeguarding: false,
  } satisfies SchoolOpsSignalCounts);
  assert.equal(alerts.some((a) => a.id === "timetable-conflict-blocking"), true);
  assert.equal(alerts.some((a) => a.id === "timetable-room-warning"), true);
});

test("timetable UI shows room warnings and conflict banners", () => {
  const src = read("src/components/admin/schools/SchoolTodayTimetable.tsx");
  assert.match(src, /findDaySchoolConflicts/);
  assert.match(src, /roomWarningCount/);
  assert.match(src, /blockingConflictCount/);
});