import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPrimaryNavLinks } from "../src/components/layout/Navbar";

test("student context navigation includes Day School, Short Learning, and Ga Learning Hub", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/student/profile",
    gaLearningHubHref: "/ga-learning-hub",
  });

  assert.deepEqual(
    links.map((link) => ({ href: link.href, label: link.label })),
    [
      { href: "/student/dashboard", label: "Home" },
      { href: "/student/today", label: "Day School" },
      { href: "/student/short-learning", label: "Short Learning" },
      { href: "/student/attendance", label: "Attendance" },
      { href: "/ga-learning-hub", label: "Ga Learning Hub" },
      { href: "/student/profile", label: "My Profile" },
    ],
  );
  assert.equal(new Set(links.map((link) => link.id)).size, links.length);
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
      { href: "/student/attendance", label: "Attendance" },
      { href: "/parent/dashboard", label: "Parent Area" },
    ],
  );
  assert.equal(new Set(links.map((link) => link.id)).size, links.length);
  assert.equal(new Set(links.map((link) => link.href)).size, links.length);
  assert.equal(links.some((link) => link.label === "Parent Area" && link.href === "/parent/dashboard"), true);
  assert.equal(links.some((link) => /profiles\?intent=parent/.test(link.href)), false);
});

test("direct student navigation has no Parent Area link", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "/student/dashboard",
    profileHref: "/student/profile",
    gaLearningHubHref: "/ga-learning-hub",
  });
  assert.equal(links.some((link) => /parent/i.test(link.label) || link.href.startsWith("/parent")), false);
});

test("missing or blank href values are omitted instead of crashing the Navbar", () => {
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: true,
    dashboardHref: "",
    profileHref: "/student/profile",
    gaLearningHubHref: "   ",
  });
  assert.equal(links.every((link) => Boolean(link.href) && Boolean(link.id) && Boolean(link.label)), true);
  assert.equal(links.some((link) => link.href === "/student/profile"), true);
  assert.equal(links.some((link) => link.label === "Ga Learning Hub"), false);
  assert.equal(links.some((link) => link.label === "Home"), false);
});

test("unresolved auth on a student page must not show Ga Learning Hub", () => {
  // Mirrors parent opening a child → /student/dashboard before /api/auth/me resolves.
  const links = buildPrimaryNavLinks({
    showParentAccess: false,
    isStudentContext: false,
    dashboardHref: "/student/dashboard",
    profileHref: "/student/profile",
    gaLearningHubHref: "/ga-learning-hub",
  });

  assert.deepEqual(
    links.map((link) => ({ href: link.href, label: link.label })),
    [
      { href: "/student/dashboard", label: "Dashboard" },
      { href: "/student/profile", label: "My Profile" },
    ],
  );
  assert.equal(links.some((link) => link.label === "Ga Learning Hub"), false);
});

test("Navbar renders with unique React keys and keeps logout", () => {
  const source = readFileSync(join(process.cwd(), "src/components/layout/Navbar.tsx"), "utf8");
  assert.match(source, /key=\{link\.id\}/);
  assert.doesNotMatch(source, /key=\{link\.href\}/);
  assert.match(source, /function logout\(/);
  assert.match(source, /\/api\/auth\/logout/);
});

test("trial-exhausted student dashboard keeps Navbar and friendly billing CTA", () => {
  const source = readFileSync(join(process.cwd(), "src/app/student/dashboard/page.tsx"), "utf8");
  assert.match(source, /<Navbar\s*\/>/);
  assert.match(source, /free trial sessions are used up/i);
  assert.match(source, /Open Parent Billing/);
  assert.match(source, /\/parent\/billing/);
  // Internal parsing may reference access fields; user-facing copy must stay non-technical.
  assert.doesNotMatch(source, /setError\([^\)]*stripeCustomerId/);
  assert.doesNotMatch(source, /setError\([^\)]*trialSessionsUsed/);
  assert.match(source, /summaryRes\.status === 402/);
});
