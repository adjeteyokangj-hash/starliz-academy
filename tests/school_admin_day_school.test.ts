import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

test("school-admin day-school APIs are membership-scoped", () => {
  const dashboard = readFileSync(
    resolve(ROOT, "src/app/api/school-admin/day-school/dashboard/route.ts"),
    "utf8",
  );
  const actions = readFileSync(
    resolve(ROOT, "src/app/api/school-admin/day-school/actions/route.ts"),
    "utf8",
  );
  const attendance = readFileSync(
    resolve(ROOT, "src/app/api/school-admin/day-school/attendance/route.ts"),
    "utf8",
  );

  for (const source of [dashboard, actions, attendance]) {
    assert.match(source, /requireSchoolAdminContext/);
    assert.match(source, /ctx\.schoolId/);
  }
  assert.match(actions, /Membership schoolId is authoritative/);
  assert.doesNotMatch(actions, /requireAdminPermission/);
  assert.match(dashboard, /findSchoolDashboardRecord/);
});

test("timetable wrapper uses school-portal mode of school-wide timetable", () => {
  const page = readFileSync(
    resolve(ROOT, "src/app/school-admin/day-school/timetable/page.tsx"),
    "utf8",
  );
  assert.match(page, /SchoolTodayTimetable/);
  assert.match(page, /portalMode="school-portal"/);
  assert.match(page, /School-wide Day School/);
  assert.doesNotMatch(page, /\/teacher\/timetable/);
});

test("day school pages require school admin context", () => {
  const pages = [
    "timetable",
    "classes",
    "students",
    "teachers",
    "attendance",
    "lessons",
    "lesson-review",
    "reports",
  ];
  for (const name of pages) {
    const path = resolve(ROOT, `src/app/school-admin/day-school/${name}/page.tsx`);
    assert.equal(existsSync(path), true, path);
    const source = readFileSync(path, "utf8");
    assert.match(source, /requireSchoolAdminContext/);
  }
});

test("school portal timetable component hides platform content library for portal mode", () => {
  const timetable = readFileSync(
    resolve(ROOT, "src/components/admin/schools/SchoolTodayTimetable.tsx"),
    "utf8",
  );
  const modal = readFileSync(
    resolve(ROOT, "src/components/admin/schools/LessonReviewModal.tsx"),
    "utf8",
  );
  assert.match(timetable, /portalMode/);
  assert.match(timetable, /\/api\/school-admin\/day-school\/actions/);
  assert.match(timetable, /hideContentLibrary=\{portalMode === "school-portal"\}/);
  assert.match(modal, /hideContentLibrary/);
});

test("school portal timetable uses light-surface tokens in portal mode", () => {
  const timetable = readFileSync(
    resolve(ROOT, "src/components/admin/schools/SchoolTodayTimetable.tsx"),
    "utf8",
  );
  assert.match(timetable, /const isPortal = portalMode === "school-portal"/);
  assert.match(timetable, /text-foreground/);
  assert.match(timetable, /bg-card/);
  assert.match(timetable, /border-border/);
  assert.match(timetable, /text-foreground\/60/);
  // Dark admin text must stay gated behind the non-portal style map.
  assert.match(timetable, /heading: "mt-1 text-xl font-black text-white"/);
  assert.match(timetable, /heading: "mt-1 text-xl font-black text-foreground"/);
});