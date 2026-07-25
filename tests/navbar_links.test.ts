import test from "node:test";
import assert from "node:assert/strict";
import { buildPrimaryNavLinks } from "../src/components/layout/Navbar";

test("student context navigation includes Ga Learning Hub", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/student/profile",
    gaLearningHubHref: "/ga-learning-hub",
  });

  assert.deepEqual(links, [
    { href: "/student/dashboard", label: "Home" },
    { href: "/student/today", label: "Today" },
    { href: "/student/attendance", label: "Attendance" },
    { href: "/ga-learning-hub", label: "Ga Learning Hub" },
    { href: "/student/profile", label: "My Profile" },
  ]);
});

test("parent access navigation keeps parent routes and child school links", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: true,
    isStudentContext: false,
    dashboardHref: "/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
  });

  assert.deepEqual(links, [
    { href: "/parent/dashboard", label: "Dashboard" },
    { href: "/dashboard", label: "Child Dashboard" },
    { href: "/student/today", label: "Today" },
    { href: "/student/attendance", label: "Attendance" },
    { href: "/parent/profiles?intent=parent", label: "Parent Area" },
  ]);
});

test("unresolved auth on a student page must not show Ga Learning Hub", () => {
  // Mirrors parent opening Atswei → /student/dashboard before /api/auth/me resolves.
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: false,
    dashboardHref: "/student/dashboard",
    profileHref: "/student/profile",
    gaLearningHubHref: "/ga-learning-hub",
  });

  assert.deepEqual(links, [
    { href: "/student/dashboard", label: "Dashboard" },
    { href: "/student/profile", label: "My Profile" },
  ]);
  assert.equal(links.some((link) => link.label === "Ga Learning Hub"), false);
});
