import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultStudentDashboardSections,
  DEFAULT_MASTERED_REVIEW_POLICY,
  mergeStudentDashboardSections,
  mergeStudentDashboardSettings,
  parseStudentDashboardSections,
  parseStudentDashboardSettings,
  selectFocusAreaSkills,
  selectImprovingSkills,
  selectMasteredReviewSkills,
  serializeStudentDashboardSettings,
  STUDENT_DASHBOARD_SECTION_KEYS,
} from "../src/lib/student-dashboard-sections";

test("defaults hide every gated dashboard section", () => {
  const defaults = defaultStudentDashboardSections();
  for (const key of STUDENT_DASHBOARD_SECTION_KEYS) {
    assert.equal(defaults[key], false);
  }
});

test("parseStudentDashboardSections treats null and invalid as all false", () => {
  assert.deepEqual(parseStudentDashboardSections(null), defaultStudentDashboardSections());
  assert.deepEqual(parseStudentDashboardSections("{"), defaultStudentDashboardSections());
  assert.deepEqual(parseStudentDashboardSections("[]"), defaultStudentDashboardSections());
});

test("parse and merge preserve enabled flags", () => {
  const parsed = parseStudentDashboardSections(JSON.stringify({ firstLessons: true, recoveryPath: 1, certificates: false }));
  assert.equal(parsed.firstLessons, true);
  assert.equal(parsed.recoveryPath, false);
  const merged = mergeStudentDashboardSections(parsed, { assignedWork: true, firstLessons: false });
  assert.equal(merged.assignedWork, true);
  assert.equal(merged.firstLessons, false);
});

test("mastered review policy defaults and clamps", () => {
  const settings = parseStudentDashboardSettings(JSON.stringify({
    firstLessons: true,
    masteredReview: { replaceAfterDays: 999, maxSubjectSessions: 0 },
  }));
  assert.equal(settings.sections.firstLessons, true);
  assert.equal(settings.masteredReview.replaceAfterDays, 90);
  assert.equal(settings.masteredReview.maxSubjectSessions, 1);
  assert.equal(DEFAULT_MASTERED_REVIEW_POLICY.maxSubjectSessions, 5);
});

test("selectMasteredReviewSkills applies window and max sessions", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const selected = selectMasteredReviewSkills(
    [
      { skill: "old", status: "mastered", accuracy: 90, updatedAt: "2026-08-01T12:00:00.000Z" },
      { skill: "recent_a", status: "mastered", accuracy: 92, updatedAt: "2026-09-18T12:00:00.000Z" },
      { skill: "recent_b", status: "mastered", accuracy: 88, updatedAt: "2026-09-19T12:00:00.000Z" },
      { skill: "recent_c", status: "mastered", accuracy: 95, updatedAt: "2026-09-20T12:00:00.000Z" },
      { skill: "weak", status: "weak", accuracy: 40, updatedAt: "2026-09-20T12:00:00.000Z" },
    ],
    { replaceAfterDays: 14, maxSubjectSessions: 2 },
    now,
  );
  assert.deepEqual(selected.map((row) => row.skill), ["recent_c", "recent_b"]);
});

test("selectImprovingSkills and selectFocusAreaSkills use the same automatic pool rules", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const improving = selectImprovingSkills(
    [
      { skill: "old_imp", status: "improving", accuracy: 60, updatedAt: "2026-08-01T12:00:00.000Z" },
      { skill: "new_imp", status: "improving", accuracy: 65, updatedAt: "2026-09-20T12:00:00.000Z" },
      { skill: "mastered", status: "mastered", accuracy: 90, updatedAt: "2026-09-20T12:00:00.000Z" },
    ],
    DEFAULT_MASTERED_REVIEW_POLICY,
    now,
  );
  const focus = selectFocusAreaSkills(
    [
      { skill: "old_weak", status: "weak", accuracy: 30, updatedAt: "2026-08-01T12:00:00.000Z" },
      { skill: "new_weak", status: "weak", accuracy: 35, updatedAt: "2026-09-19T12:00:00.000Z" },
    ],
    DEFAULT_MASTERED_REVIEW_POLICY,
    now,
  );
  assert.deepEqual(improving.map((row) => row.skill), ["new_imp"]);
  assert.deepEqual(focus.map((row) => row.skill), ["new_weak"]);
});

test("settings round-trip keeps mastered review policy", () => {
  const merged = mergeStudentDashboardSettings(
    {
      sections: defaultStudentDashboardSections(),
      masteredReview: { ...DEFAULT_MASTERED_REVIEW_POLICY },
    },
    {
      sections: { languageAdventure: true },
      masteredReview: { replaceAfterDays: 21, maxSubjectSessions: 4 },
    },
  );
  const roundTrip = parseStudentDashboardSettings(serializeStudentDashboardSettings(merged));
  assert.equal(roundTrip.sections.languageAdventure, true);
  assert.deepEqual(roundTrip.masteredReview, { replaceAfterDays: 21, maxSubjectSessions: 4 });
});

test("admin dashboard-sections route is permission gated and upserts StudentProfile", () => {
  const route = readFileSync("src/app/api/admin/students/[id]/dashboard-sections/route.ts", "utf8");
  assert.match(route, /requireAdminPermission\("students:write"\)/);
  assert.match(route, /dashboardSectionsJson/);
  assert.match(route, /studentProfile\.create/);
  assert.match(route, /writeAuditLog/);
});

test("student dashboard summary returns dashboardSections and automatic masteredReview", () => {
  const route = readFileSync("src/app/api/student/dashboard-summary/route.ts", "utf8");
  assert.match(route, /dashboardSections/);
  assert.match(route, /DEFAULT_MASTERED_REVIEW_POLICY/);
});

test("student dashboard sections expose exactly the approved 10 keys", () => {
  assert.deepEqual([...STUDENT_DASHBOARD_SECTION_KEYS], [
    "firstLessons",
    "assignedWork",
    "learningTwin",
    "lastSession",
    "prioritySummary",
    "languageAdventure",
    "recoveryPath",
    "weeklyHomework",
    "subjectProgression",
    "certificates",
  ]);
});

test("student dashboards gate sections and auto-select skill pools", () => {
  const secondary = readFileSync("src/components/student/SecondaryDashboard.tsx", "utf8");
  assert.match(secondary, /sections\.firstLessons/);
  assert.match(secondary, /sections\.assignedWork/);
  assert.match(secondary, /sections\.lastSession && sessionSummary/);
  assert.match(secondary, /isGcse \? \(/);
  assert.doesNotMatch(secondary, /sections\.gcseProgress/);
  assert.match(secondary, /selectMasteredReviewSkills/);
  assert.match(secondary, /selectImprovingSkills/);
  assert.match(secondary, /selectFocusAreaSkills/);
  assert.match(secondary, /DEFAULT_MASTERED_REVIEW_POLICY/);

  const primary = readFileSync("src/components/student/PrimaryDashboard.tsx", "utf8");
  assert.match(primary, /sections\.firstLessons/);
  assert.match(primary, /sections\.assignedWork && !loading && visibleAssignments\.length > 0/);
  assert.match(primary, /sections\.lastSession && sessionSummary/);
  assert.match(primary, /Your Assigned Tasks/);
  assert.match(primary, /AI Learning Signals/);
  // False gates must short-circuit before the Assigned Tasks / AI Learning Signals bodies.
  assert.doesNotMatch(primary, /\{\s*!loading && visibleAssignments\.length > 0 && \(/);
  assert.doesNotMatch(primary, /\{\s*sessionSummary && \(/);

  const admin = readFileSync("src/app/admin/(secure)/students/[id]/page.tsx", "utf8");
  assert.match(admin, /Student Dashboard Sections/);
  assert.doesNotMatch(admin, /Mastered review settings/);
  const helper = readFileSync("src/lib/student-dashboard-sections.ts", "utf8");
  assert.doesNotMatch(helper, /gcseProgress/);
});

test("primary dashboard assignedWork and lastSession gates enclose complete blocks", () => {
  const primary = readFileSync("src/components/student/PrimaryDashboard.tsx", "utf8");
  assert.match(
    primary,
    /sections\.assignedWork && !loading && visibleAssignments\.length > 0 \? \([\s\S]*?Your Assigned Tasks[\s\S]*?\) : null\}/,
  );
  assert.match(
    primary,
    /sections\.lastSession && sessionSummary \? \([\s\S]*?AI Learning Signals[\s\S]*?\) : null\}/,
  );
});