import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSchoolOpsQuickActions,
  deriveSchoolOpsAlerts,
  humanizeSchoolAuditActivity,
  SCHOOL_OPS_LIMITATIONS,
  type SchoolOpsSignalCounts,
} from "../src/lib/schools/school-ops-overview";

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

test("overview route gates with school admin context and viewDashboard", () => {
  const route = read("src/app/api/school-admin/overview/route.ts");
  assert.match(route, /requireSchoolAdminContext/);
  assert.match(route, /canDo\(ctx\.role, "viewDashboard"\)/);
  assert.match(route, /buildSchoolOpsOverview/);
  assert.doesNotMatch(route, /\/admin\//);
  assert.doesNotMatch(route, /requireAdminPermission/);
});

test("overview page uses SchoolOpsDashboardClient inside school-admin", () => {
  const page = read("src/app/school-admin/page.tsx");
  assert.match(page, /SchoolOpsDashboardClient/);
  assert.match(page, /requireSchoolAdminContext/);
  assert.doesNotMatch(page, /\/admin\//);
  assert.doesNotMatch(page, /ShortLearningOverviewMetrics/);
});

test("ops dashboard client stays under school-admin routes and APIs", () => {
  const client = read("src/components/school-admin/SchoolOpsDashboardClient.tsx");
  assert.match(client, /\/api\/school-admin\/overview/);
  assert.match(client, /CollapsibleCard/);
  assert.match(client, /Needs attention/);
  assert.match(client, /Quick actions/);
  assert.match(client, /\/school-admin\/day-school\//);
  assert.match(client, /\/school-admin\/short-learning\//);
  assert.doesNotMatch(client, /\/teacher\//);
  assert.doesNotMatch(client, /\/admin\//);
});

test("humanizeSchoolAuditActivity maps known actions and classroom modes", () => {
  assert.equal(humanizeSchoolAuditActivity({ action: "student_enrolled" }).label, "Student enrolled");
  assert.equal(humanizeSchoolAuditActivity({ action: "invite_accepted" }).label, "Invitation accepted");
  assert.equal(
    humanizeSchoolAuditActivity({
      action: "classroom_updated",
      entityType: "classroom",
      entityId: "c1",
      metadata: { mode: "teacher_assigned" },
    }).label,
    "Teacher assigned to class",
  );
  assert.equal(
    humanizeSchoolAuditActivity({ action: "daytime_lesson_approved" }).label,
    "Lesson approved",
  );
  assert.equal(
    humanizeSchoolAuditActivity({
      action: "short_learning_booking_changed",
      entityType: "learning_booking",
      entityId: "b1",
    }).href,
    "/school-admin/short-learning/bookings/b1",
  );
});

test("deriveSchoolOpsAlerts only emits true conditions and gates safeguarding", () => {
  assert.deepEqual(deriveSchoolOpsAlerts(baseSignals()), []);

  const withGaps = deriveSchoolOpsAlerts(
    baseSignals({
      unassignedClasses: 2,
      coverageGapMinutes: 45,
      includeSafeguarding: true,
      safeguardingOpen: 1,
      safeguardingCritical: 0,
    }),
  );
  assert.equal(withGaps.some((a) => a.id === "class-no-teacher"), true);
  assert.equal(withGaps.some((a) => a.id === "sl-coverage-gap"), true);
  assert.equal(withGaps.some((a) => a.id === "safeguarding-open"), true);

  const withoutSafeguarding = deriveSchoolOpsAlerts(
    baseSignals({
      includeSafeguarding: false,
      safeguardingOpen: 3,
      safeguardingCritical: 2,
    }),
  );
  assert.equal(withoutSafeguarding.some((a) => a.id.startsWith("safeguarding")), false);
});

test("quick actions keep Create School Admin owner-only", () => {
  const owner = buildSchoolOpsQuickActions("owner");
  const admin = buildSchoolOpsQuickActions("admin");
  assert.equal(owner.some((a) => a.label === "Create School Admin"), true);
  assert.equal(admin.some((a) => a.label === "Create School Admin"), false);
  for (const action of [...owner, ...admin]) {
    assert.match(action.href, /^\/school-admin\//);
  }
});

test("limitations document heartbeat lag after absence+conflicts", () => {
  assert.equal(SCHOOL_OPS_LIMITATIONS.length >= 1, true);
  assert.doesNotMatch(SCHOOL_OPS_LIMITATIONS.join(" "), /Staff absent today is not modelled/);
  assert.doesNotMatch(SCHOOL_OPS_LIMITATIONS.join(" "), /timetable conflicts are not detected/);
  assert.match(SCHOOL_OPS_LIMITATIONS.join(" "), /heartbeat/i);
});