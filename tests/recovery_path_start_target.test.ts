import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolveCatchUpStartTarget } from "../src/lib/student-dashboard-actions";

const hasMathRoute = existsSync("src/app/games/math/page.tsx");
const hasReadingRoute = existsSync("src/app/games/reading/page.tsx");
const hasSpellingRoute = existsSync("src/app/games/spelling/page.tsx");
const hasDailyJourneyRoute = existsSync("src/app/student/daily-journey/page.tsx");

test("resolveCatchUpStartTarget uses explicit valid routeTarget", () => {
  const target = resolveCatchUpStartTarget({
    title: "Fractions sprint",
    routeTarget: "/games/lesson?lessonId=fractions-001",
  });

  assert.equal(target.kind, "route");
  assert.equal(target.href, "/games/lesson?lessonId=fractions-001");
  assert.equal(target.label, "Start");
});

test("resolveCatchUpStartTarget rejects /student/dashboard as unusable", () => {
  const target = resolveCatchUpStartTarget({
    title: "Dashboard fallback",
    routeTarget: "/student/dashboard",
  });

  assert.equal(target.kind, "unavailable");
  assert.equal(target.label, "Waiting for recovery activity");
});

test("resolveCatchUpStartTarget math fallback is route-backed only when math route exists", () => {
  const target = resolveCatchUpStartTarget({
    title: "Math catch-up",
    subject: "Math",
    routeTarget: "/student/dashboard",
  });

  if (hasMathRoute) {
    assert.equal(target.kind, "route");
    assert.match(target.href, /^\/games\/math\?recovery=1/);
  } else {
    assert.equal(target.kind, "unavailable");
    assert.equal(target.label, "Waiting for recovery activity");
  }
});

test("resolveCatchUpStartTarget reading fallback is route-backed only when reading route exists", () => {
  const target = resolveCatchUpStartTarget({
    title: "Reading catch-up",
    subject: "Reading",
    routeTarget: "/student/dashboard",
  });

  if (hasReadingRoute) {
    assert.equal(target.kind, "route");
    assert.match(target.href, /^\/games\/reading\?recovery=1/);
  } else {
    assert.equal(target.kind, "unavailable");
    assert.equal(target.label, "Waiting for recovery activity");
  }
});

test("resolveCatchUpStartTarget spelling fallback is route-backed only when spelling route exists", () => {
  const target = resolveCatchUpStartTarget({
    title: "Spelling catch-up",
    subject: "Spelling",
    routeTarget: "/student/dashboard",
  });

  if (hasSpellingRoute) {
    assert.equal(target.kind, "route");
    assert.match(target.href, /^\/games\/spelling\?recovery=1/);
  } else {
    assert.equal(target.kind, "unavailable");
    assert.equal(target.label, "Waiting for recovery activity");
  }
});

test("resolveCatchUpStartTarget unknown subject uses daily journey only when route exists", () => {
  const target = resolveCatchUpStartTarget({
    title: "General science recap",
    subject: "Science",
    routeTarget: "/student/dashboard",
  });

  if (hasDailyJourneyRoute) {
    assert.equal(target.kind, "route");
    assert.match(target.href, /^\/student\/daily-journey\?recovery=1/);
  } else {
    assert.equal(target.kind, "unavailable");
    assert.equal(target.label, "Waiting for recovery activity");
  }
});

test("resolveCatchUpStartTarget with no subject and no route is unavailable", () => {
  const target = resolveCatchUpStartTarget({
    title: "Unlinked recovery task",
    routeTarget: null,
  });

  assert.equal(target.kind, "unavailable");
  assert.equal(target.label, "Waiting for recovery activity");
  assert.match(target.message, /not linked yet/i);
});
