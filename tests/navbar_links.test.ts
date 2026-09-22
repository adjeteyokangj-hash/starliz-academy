import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPrimaryNavLinks } from "../src/components/layout/Navbar";

test("student navigation is lean: Home, Day School, Short Learning only by default", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
    showGaLearningHub: false,
  });

  assert.deepEqual(
    links.map((link) => ({ href: link.href, label: link.label })),
    [
      { href: "/student/dashboard", label: "Home" },
      { href: "/student/today", label: "Day School" },
      { href: "/student/short-learning", label: "Short Learning" },
    ],
  );
  assert.equal(links.some((link) => link.label === "Ga Learning Hub"), false);
  assert.equal(links.some((link) => link.label === "My Profile"), false);
  assert.equal(links.some((link) => link.label === "Attendance"), false);
  assert.equal(new Set(links.map((link) => link.id)).size, links.length);
});

test("student navigation shows Ga Learning Hub only when admin assignment enables it", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
    showGaLearningHub: true,
  });

  assert.equal(links.some((link) => link.label === "Ga Learning Hub" && link.href === "/ga-learning-hub"), true);
  assert.equal(links.some((link) => link.label === "My Profile"), false);
  assert.equal(links.some((link) => link.label === "Attendance"), false);
});

test("parent-in-child navigation keeps unique keys and Parent Area on /parent/dashboard", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: true,
    isStudentContext: false,
    dashboardHref: "/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
  });

  assert.deepEqual(
    links.map((link) => ({ href: link.href, label: link.label })),
    [
      { href: "/student/dashboard", label: "Child Dashboard" },
      { href: "/student/today", label: "Today" },
      { href: "/student/short-learning", label: "Short Learning" },
      { href: "/parent/dashboard", label: "Parent Area" },
    ],
  );
  assert.equal(new Set(links.map((link) => link.id)).size, links.length);
  assert.equal(new Set(links.map((link) => link.href)).size, links.length);
  assert.equal(links.some((link) => link.label === "Parent Area" && link.href === "/parent/dashboard"), true);
  assert.equal(links.some((link) => link.label === "Attendance"), false);
  assert.equal(links.some((link) => /profiles\?intent=parent/.test(link.href)), false);
});

test("direct student navigation has no Parent Area link", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
  });
  assert.equal(links.some((link) => /parent/i.test(link.label) || link.href.startsWith("/parent")), false);
});

test("parent account navigation keeps My Profile", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: false,
    dashboardHref: "/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
  });

  assert.deepEqual(
    links.map((link) => ({ href: link.href, label: link.label })),
    [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/my-profile", label: "My Profile" },
    ],
  );
});

test("missing or blank href values are omitted instead of crashing the Navbar", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "",
    profileHref: "/my-profile",
    gaLearningHubHref: "   ",
    showGaLearningHub: true,
  });
  assert.equal(links.every((link) => Boolean(link.href) && Boolean(link.id) && Boolean(link.label)), true);
  assert.equal(links.some((link) => link.label === "Ga Learning Hub"), false);
  assert.equal(links.some((link) => link.label === "Home"), false);
  assert.equal(links.some((link) => link.label === "My Profile"), false);
});

test("unresolved auth on a student page must not show Ga Learning Hub or My Profile", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/my-profile",
    gaLearningHubHref: "/ga-learning-hub",
    showGaLearningHub: false,
  });

  assert.deepEqual(
    links.map((link) => ({ href: link.href, label: link.label })),
    [
      { href: "/student/dashboard", label: "Home" },
      { href: "/student/today", label: "Day School" },
      { href: "/student/short-learning", label: "Short Learning" },
    ],
  );
  assert.equal(links.some((link) => link.label === "Ga Learning Hub"), false);
  assert.equal(links.some((link) => link.label === "My Profile"), false);
});

test("Navbar gates Ga Learning Hub on children/active assignment modules", () => {
  const source = readFileSync(join(process.cwd(), "src/components/layout/Navbar.tsx"), "utf8");
  assert.match(source, /key=\{link\.id\}/);
  assert.doesNotMatch(source, /key=\{link\.href\}/);
  assert.match(source, /function logout\(/);
  assert.match(source, /\/api\/auth\/logout/);
  assert.match(source, /\/api\/children\/active/);
  assert.doesNotMatch(source, /\/api\/student\/dashboard-summary/);
  assert.match(source, /ga-learning-hub/);
  assert.match(source, /showGaLearningHub/);

  const activeRoute = readFileSync(join(process.cwd(), "src/app/api/children/active/route.ts"), "utf8");
  assert.match(activeRoute, /parseStudentDashboardSections/);
  assert.match(activeRoute, /languageAdventure/);
  assert.match(activeRoute, /hasGaModule && sections\.languageAdventure/);
});

test("Navbar keeps Day School and Short Learning on student pages when role is still unknown", () => {
  const source = readFileSync(join(process.cwd(), "src/components/layout/Navbar.tsx"), "utf8");
  assert.match(source, /pendingStudentExperience = isStudentPage && !isStudentRole && role !== "parent"/);
  assert.match(source, /Day School/);
  assert.match(source, /Short Learning/);
});

test("trial-exhausted student dashboard keeps Navbar and friendly billing CTA", () => {
  const source = readFileSync(join(process.cwd(), "src/app/student/dashboard/page.tsx"), "utf8");
  assert.match(source, /<Navbar\s*\/>/);
  assert.match(source, /free trial sessions are used up/i);
  assert.match(source, /Open Parent Billing/);
  assert.match(source, /\/parent\/billing/);
  assert.doesNotMatch(source, /setError\([^\)]*stripeCustomerId/);
  assert.doesNotMatch(source, /setError\([^\)]*trialSessionsUsed/);
  assert.match(source, /summaryRes\.status === 402/);
});
