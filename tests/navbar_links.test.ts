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
    { href: "/student/dashboard", label: "Dashboard" },
    { href: "/ga-learning-hub", label: "Ga Learning Hub" },
    { href: "/student/profile", label: "My Profile" },
  ]);
});

test("parent access navigation keeps parent routes and excludes student runtime links", () => {
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
    { href: "/parent/profiles?intent=parent", label: "Parent Area" },
  ]);
});
