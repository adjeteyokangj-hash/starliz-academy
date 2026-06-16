import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveHomeworkStartTarget,
  resolveSchoolWeekGoTarget,
} from "../src/lib/student-dashboard-actions";

const gaHubSource = readFileSync("src/app/ga-learning-hub/page.tsx", "utf8");
const dashboardSource = readFileSync("src/app/student/dashboard/page.tsx", "utf8");

test("student ga hub does not show admin dictionary or voice buttons", () => {
  assert.equal(gaHubSource.includes("Open Ga Dictionary"), false);
  assert.equal(gaHubSource.includes("Review Ga Voice"), false);
  assert.equal(gaHubSource.includes("/admin/ga-"), false);
});

test("student dashboard still embeds the curriculum mastery map", () => {
  assert.equal(dashboardSource.includes("CurriculumMasteryMap"), true);
  assert.equal(dashboardSource.includes("learning-map-panel"), true);
});

test("school week mode Go resolves to local targets when dashboard fallback would have been used", () => {
  const checkIn = resolveSchoolWeekGoTarget({ activityType: "check_in", routeTarget: "/student/dashboard", title: "Check-in" });
  assert.equal(checkIn.kind, "top");

  const catchUp = resolveSchoolWeekGoTarget({ activityType: "catch_up", routeTarget: "/student/dashboard", title: "Catch-up" });
  assert.equal(catchUp.kind, "scroll");
  assert.equal(catchUp.targetId, "smart-catch-up-panel");

  const homework = resolveSchoolWeekGoTarget({ activityType: "homework", routeTarget: "/student/dashboard", title: "Homework" });
  assert.equal(homework.kind, "scroll");
  assert.equal(homework.targetId, "weekly-homework-panel");

  const fallback = resolveSchoolWeekGoTarget({ activityType: "quiz", routeTarget: "/student/dashboard", title: "Quiz" });
  assert.equal(fallback.kind, "scroll");
  assert.equal(fallback.targetId, "today-journey-panel");
  assert.match(fallback.message, /not linked yet/i);
});

test("homework start resolves to a route, panel, or clear unavailable state", () => {
  const routed = resolveHomeworkStartTarget({ title: "Ga lesson", routeTarget: "/ga-learning-hub/hello" });
  assert.equal(routed.kind, "route");
  assert.equal(routed.href, "/ga-learning-hub/hello");

  const local = resolveHomeworkStartTarget({ title: "This week's homework", routeTarget: "/student/dashboard" });
  assert.equal(local.kind, "unavailable");
  assert.match(local.message, /not linked/i);
});