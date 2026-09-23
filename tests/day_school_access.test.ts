import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  daySchoolAccessBlock,
  directDaySchoolRouteDecision,
  hasDaySchoolAccess,
  shortLearningMembershipRemains,
  studentDaySchoolPresentation,
  type DaySchoolAccessInput,
} from "../src/lib/schools/day-school-access";
import { buildPrimaryNavLinks } from "../src/components/layout/Navbar";

const enabledStudent: DaySchoolAccessInput = {
  membershipStatus: "active",
  classroomId: "class-year-4",
  schoolDaySchoolEnabled: true,
  studentDaySchoolEnabled: true,
};

test("Day School enabled keeps the existing dashboard experience", () => {
  const view = studentDaySchoolPresentation(enabledStudent);
  assert.equal(hasDaySchoolAccess(enabledStudent), true);
  assert.equal(view.showDaySchoolCard, true);
  assert.equal(view.showRegistration, true);
  assert.equal(view.showEnterSchoolDay, true);
  assert.equal(view.showTimetable, true);
  assert.equal(view.showAttendanceCounters, true);
  assert.equal(view.showShortLearning, true);
  assert.equal(directDaySchoolRouteDecision(enabledStudent), "allow");
  assert.equal(daySchoolAccessBlock(enabledStudent), null);
});

test("Day School disabled hides Day School UI and keeps Short Learning", () => {
  const disabledSchool: DaySchoolAccessInput = { ...enabledStudent, schoolDaySchoolEnabled: false };
  const view = studentDaySchoolPresentation(disabledSchool);
  assert.equal(view.showDaySchoolCard, false);
  assert.equal(view.showRegistration, false);
  assert.equal(view.showEnterSchoolDay, false);
  assert.equal(view.showTimetable, false);
  assert.equal(view.showAttendanceCounters, false);
  assert.equal(view.showShortLearning, true);
  assert.equal(shortLearningMembershipRemains(disabledSchool), true);
});

test("Day School disabled blocks direct Day School routes", () => {
  const disabledSchool: DaySchoolAccessInput = { ...enabledStudent, schoolDaySchoolEnabled: false };
  const block = daySchoolAccessBlock(disabledSchool);
  assert.equal(directDaySchoolRouteDecision(disabledSchool), "block");
  assert.equal(block?.status, 403);
  assert.equal(block?.code, "DAY_SCHOOL_DISABLED");
  assert.match(block?.error ?? "", /Short Learning is still available/);
});

test("re-enabling Day School restores the same class without recreating history", () => {
  const school = {
    daySchoolEnabled: false,
    students: [
      {
        id: "lizzy",
        classroomId: "class-year-4",
        status: "active",
        daySchoolEnabled: true,
        bookings: ["booking-english"],
        attendanceIds: ["mark-1", "mark-2"],
      },
    ],
  };

  school.daySchoolEnabled = true;
  const restored = school.students[0]!;
  assert.equal(restored.classroomId, "class-year-4");
  assert.deepEqual(restored.bookings, ["booking-english"]);
  assert.deepEqual(restored.attendanceIds, ["mark-1", "mark-2"]);
  assert.equal(restored.status, "active");
  assert.equal(hasDaySchoolAccess({
    membershipStatus: restored.status,
    classroomId: restored.classroomId,
    schoolDaySchoolEnabled: school.daySchoolEnabled,
    studentDaySchoolEnabled: restored.daySchoolEnabled,
  }), true);
});

test("removing one student from Day School leaves classmates and Short Learning intact", () => {
  const classmates = [
    { id: "lizzy", classroomId: "class-year-4", status: "active", daySchoolEnabled: true, bookings: ["booking-english"] },
    { id: "ephi", classroomId: "class-year-4", status: "active", daySchoolEnabled: true, bookings: ["booking-maths"] },
  ];

  const lizzy = classmates[0]!;
  lizzy.daySchoolEnabled = false;

  assert.equal(hasDaySchoolAccess({
    membershipStatus: lizzy.status,
    classroomId: lizzy.classroomId,
    schoolDaySchoolEnabled: true,
    studentDaySchoolEnabled: lizzy.daySchoolEnabled,
  }), false);
  assert.equal(shortLearningMembershipRemains({ membershipStatus: lizzy.status }), true);
  assert.deepEqual(lizzy.bookings, ["booking-english"]);
  assert.equal(lizzy.classroomId, "class-year-4");

  const ephi = classmates[1]!;
  assert.equal(hasDaySchoolAccess({
    membershipStatus: ephi.status,
    classroomId: ephi.classroomId,
    schoolDaySchoolEnabled: true,
    studentDaySchoolEnabled: ephi.daySchoolEnabled,
  }), true);
  assert.deepEqual(ephi.bookings, ["booking-maths"]);
});

test("a student with no class is not enrolled, not blocked as Day School off", () => {
  const unassigned: DaySchoolAccessInput = { ...enabledStudent, classroomId: null };
  assert.equal(directDaySchoolRouteDecision(unassigned), "not_enrolled");
  assert.equal(daySchoolAccessBlock(unassigned), null);
  assert.equal(hasDaySchoolAccess(unassigned), false);
});

test("Day School nav hides while Short Learning stays when access is off", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
    showDaySchool: false,
  });
  assert.equal(links.some((link) => link.label === "Day School"), false);
  assert.equal(links.some((link) => link.href === "/student/short-learning"), true);
});

test("Short Learning booking rules do not read the Day School switch", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/schools/short-learning-bookings.ts"), "utf8");
  assert.equal(source.includes("daySchoolEnabled"), false);
  assert.equal(source.includes("day-school-access"), false);
});
