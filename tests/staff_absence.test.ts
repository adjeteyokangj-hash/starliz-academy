import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  absenceOverlapsDay,
  isStaffAbsenceReason,
  toDateOnly,
} from "../src/lib/schools/staff-absence";
import { deriveSchoolOpsAlerts, type SchoolOpsSignalCounts } from "../src/lib/schools/school-ops-overview";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function baseSignals(overrides: Partial<SchoolOpsSignalCounts> = {}): SchoolOpsSignalCounts {
  return {
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
    timetableConflictBlocking: 0,
    timetableRoomWarnings: 0,
    staffAbsentToday: 0,
    periodsWithAbsentTeacher: 0,
    includeSafeguarding: false,
    ...overrides,
  };
}

test("staff absence date helpers and reasons", () => {
  assert.equal(isStaffAbsenceReason("sick"), true);
  assert.equal(isStaffAbsenceReason("vacation"), false);
  const day = toDateOnly("2026-07-28");
  assert.equal(absenceOverlapsDay(toDateOnly("2026-07-27"), toDateOnly("2026-07-29"), day), true);
  assert.equal(absenceOverlapsDay(toDateOnly("2026-07-20"), toDateOnly("2026-07-21"), day), false);
});

test("absences API is school-admin gated", () => {
  const route = read("src/app/api/school-admin/staff/absences/route.ts");
  assert.match(route, /requireSchoolAdminContext/);
  assert.match(route, /manageTeachers/);
  assert.match(route, /staff_absence_created/);
  assert.match(route, /staff_absence_cleared/);
});

test("ops alerts include staff absent today", () => {
  const alerts = deriveSchoolOpsAlerts(baseSignals({ staffAbsentToday: 2, periodsWithAbsentTeacher: 3 }));
  assert.equal(alerts.some((a) => a.id === "staff-absent-today"), true);
  assert.equal(alerts.some((a) => a.id === "periods-absent-teacher"), true);
});

test("staff management UI exposes mark absent today", () => {
  const client = read("src/components/school-admin/SchoolStaffManagementClient.tsx");
  assert.match(client, /Mark absent today/);
  assert.match(client, /\/api\/school-admin\/staff\/absences/);
  assert.doesNotMatch(client, /\/admin\//);
});

test("schema includes StaffAbsence model", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model StaffAbsence/);
  assert.match(schema, /startsOn\s+DateTime\s+@db\.Date/);
});