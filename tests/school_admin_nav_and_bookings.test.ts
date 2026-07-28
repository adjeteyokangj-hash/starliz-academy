import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  bookingChangeRequiresReview,
  bookingChangeSourceLabel,
  formatBookingRef,
  resolveBookingActorKind,
} from "../src/lib/schools/short-learning-booking-audit";

const navSource = readFileSync(
  resolve(process.cwd(), "src/components/school-admin/SchoolAdminNav.tsx"),
  "utf8",
);

const DAY_SCHOOL_ROUTES = [
  "/school-admin/day-school/timetable",
  "/school-admin/day-school/classes",
  "/school-admin/day-school/students",
  "/school-admin/day-school/teachers",
  "/school-admin/day-school/attendance",
  "/school-admin/day-school/lessons",
  "/school-admin/day-school/lesson-review",
  "/school-admin/day-school/reports",
] as const;

test("school admin nav separates Day School and Short Learning sections", () => {
  assert.match(navSource, /label: "Day School"/);
  assert.match(navSource, /label: "Short Learning"/);
  assert.match(navSource, /label: "Knowledge Library"/);
  assert.match(navSource, /label: "School Settings"/);
  assert.match(navSource, /href: "\/school-admin\/settings"/);
  assert.doesNotMatch(navSource, /href: "\/school"/);
  assert.match(navSource, /Switch to Teaching/);
  assert.match(navSource, /\/school-admin\/day-school\/timetable/);
  assert.match(navSource, /\/school-admin\/short-learning\/bookings/);
  assert.match(navSource, /getSchoolRoleLabel/);
});

test("school settings page stays inside School Portal", () => {
  const settingsPath = resolve(process.cwd(), "src/app/school-admin/settings/page.tsx");
  assert.equal(existsSync(settingsPath), true, "missing /school-admin/settings page");
  const settingsSource = readFileSync(settingsPath, "utf8");
  assert.match(settingsSource, /requireSchoolAdminContext/);
  assert.match(settingsSource, /School Settings/);
  assert.doesNotMatch(settingsSource, /\/teacher\//);
});

test("day school nav stays inside School Portal (no teacher routes)", () => {
  for (const href of DAY_SCHOOL_ROUTES) {
    assert.match(navSource, new RegExp(href.replace(/\//g, "\\/")));
  }
  assert.doesNotMatch(navSource, /href: "\/teacher\//);
  assert.doesNotMatch(navSource, /\/admin\/schools\//);
  assert.match(navSource, /pathname\.startsWith\("\/school-admin\/day-school"\)/);
  // Day School children must not use legacy /school workspace either
  const daySchoolBlock = navSource.slice(
    navSource.indexOf('id: "day-school"'),
    navSource.indexOf('id: "short-learning"'),
  );
  assert.doesNotMatch(daySchoolBlock, /href: "\/school"/);
  assert.doesNotMatch(daySchoolBlock, /\/teacher\//);
});

test("day school portal pages exist under school-admin", () => {
  for (const href of DAY_SCHOOL_ROUTES) {
    const pagePath = resolve(
      process.cwd(),
      "src/app",
      href.replace(/^\//, ""),
      "page.tsx",
    );
    assert.equal(existsSync(pagePath), true, `missing ${pagePath}`);
  }
});

test("lesson review and reports are distinct school-admin routes", () => {
  assert.match(navSource, /href: "\/school-admin\/day-school\/lesson-review"/);
  assert.match(navSource, /href: "\/school-admin\/day-school\/reports"/);
  const review = readFileSync(
    resolve(process.cwd(), "src/app/school-admin/day-school/lesson-review/page.tsx"),
    "utf8",
  );
  const reports = readFileSync(
    resolve(process.cwd(), "src/app/school-admin/day-school/reports/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(review, /\/teacher\/progress/);
  assert.doesNotMatch(reports, /\/teacher\/progress/);
  assert.match(review, /DaySchoolLessonReviewClient|lesson-review/);
  assert.match(reports, /DaySchoolReportsLanding|reports/);
});

test("booking refs are stable display codes", () => {
  assert.equal(formatBookingRef("cmabcdef12345678"), "SL-12345678");
});

test("change-source badges distinguish actors", () => {
  assert.equal(bookingChangeSourceLabel("parent"), "Changed by parent");
  assert.equal(bookingChangeSourceLabel("school_admin"), "Changed by School Admin");
  assert.equal(bookingChangeSourceLabel("school_owner"), "Changed by School Owner");
  assert.equal(bookingChangeSourceLabel("system"), "Changed by system");
});

test("parent late cancel and near-session changes require review", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  assert.equal(
    bookingChangeRequiresReview({
      action: "short_learning_booking_cancelled",
      actorKind: "parent",
      before: {
        startsAt: "2026-07-28T18:00:00.000Z",
        durationMinutes: 90,
        subject: "maths",
        status: "booked",
      },
      after: {
        startsAt: "2026-07-28T18:00:00.000Z",
        durationMinutes: 90,
        subject: "maths",
        status: "late_cancelled",
      },
      createdAt: new Date("2026-07-28T10:00:00.000Z"),
      now,
    }),
    true,
  );

  assert.equal(
    bookingChangeRequiresReview({
      action: "short_learning_booking_changed",
      actorKind: "parent",
      before: null,
      after: {
        startsAt: "2026-07-28T20:00:00.000Z",
        durationMinutes: 90,
        subject: "maths",
        status: "booked",
      },
      createdAt: new Date("2026-07-28T11:00:00.000Z"),
      now,
    }),
    true,
  );

  assert.equal(
    bookingChangeRequiresReview({
      action: "short_learning_booking_changed",
      actorKind: "school_admin",
      before: null,
      after: {
        startsAt: "2026-07-28T20:00:00.000Z",
        durationMinutes: 90,
        subject: "maths",
        status: "booked",
      },
      createdAt: new Date("2026-07-28T11:00:00.000Z"),
      now,
    }),
    false,
  );
});

test("actor kind resolves from membership and parent identity", () => {
  assert.equal(
    resolveBookingActorKind({ source: "parent_portal", actorUserId: "p1", parentUserId: "p1" }),
    "parent",
  );
  assert.equal(resolveBookingActorKind({ schoolRole: "admin" }), "school_admin");
  assert.equal(resolveBookingActorKind({ schoolRole: "owner" }), "school_owner");
  assert.equal(resolveBookingActorKind({ source: "system" }), "system");
});
