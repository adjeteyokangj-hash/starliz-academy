import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveCatchUpStartTarget,
  resolveHomeworkStartTarget,
  resolveSchoolWeekGoTarget,
} from "../src/lib/student-dashboard-actions";
import { isCaseInsensitiveWordDuplicate, normalizeWordForDuplicate } from "../src/lib/ga-word-normalization";

const gaHubSource = readFileSync("src/app/ga-learning-hub/page.tsx", "utf8");
const gaLessonSource = readFileSync("src/app/ga-learning-hub/[lessonId]/page.tsx", "utf8");
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
  assert.equal(checkIn.kind, "scroll");
  assert.equal(checkIn.targetId, "school-week-mode-panel");
  assert.match(checkIn.message, /check-in opens here/i);

  const catchUp = resolveSchoolWeekGoTarget({ activityType: "catch_up", routeTarget: "/student/dashboard", title: "Catch-up" });
  assert.equal(catchUp.kind, "scroll");
  assert.equal(catchUp.targetId, "smart-catch-up-panel");

  const homework = resolveSchoolWeekGoTarget({ activityType: "homework", routeTarget: "/student/dashboard", title: "Homework" });
  assert.equal(homework.kind, "scroll");
  assert.equal(homework.targetId, "weekly-homework-panel");

  const fallback = resolveSchoolWeekGoTarget({ activityType: "quiz", routeTarget: "/student/dashboard", title: "Quiz" });
  assert.equal(fallback.kind, "unavailable");
  assert.match(fallback.message, /not linked yet/i);
});

test("homework and catch-up start actions resolve to route or clear local fallback", () => {
  const routed = resolveHomeworkStartTarget({ title: "Ga lesson", routeTarget: "/ga-learning-hub/hello" });
  assert.equal(routed.kind, "route");
  assert.equal(routed.href, "/ga-learning-hub/hello");

  const homeworkLocal = resolveHomeworkStartTarget({ title: "This week's homework", routeTarget: "/student/dashboard" });
  assert.equal(homeworkLocal.kind, "unavailable");
  assert.match(homeworkLocal.message, /not linked/i);

  const catchUpLocal = resolveCatchUpStartTarget({ title: "Fractions catch-up", routeTarget: "/student/dashboard" });
  assert.equal(catchUpLocal.kind, "scroll");
  assert.equal(catchUpLocal.targetId, "smart-catch-up-panel");
  assert.match(catchUpLocal.message, /started/i);
});

test("ga current lesson card routes buttons to dedicated lesson sections", () => {
  assert.equal(gaHubSource.includes("#lesson-practice"), true);
  assert.equal(gaHubSource.includes("#lesson-pronunciation"), true);
  assert.equal(gaHubSource.includes("#lesson-quiz-progress"), true);
  assert.equal(gaLessonSource.includes('id="lesson-practice"'), true);
  assert.equal(gaLessonSource.includes('id="lesson-pronunciation"'), true);
  assert.equal(gaLessonSource.includes('id="lesson-quiz-progress"'), true);
});

test("student lesson page does not expose ga dictionary link", () => {
  assert.equal(gaLessonSource.includes("Open Ga Dictionary"), false);
  assert.equal(gaLessonSource.includes("Pronunciation references will appear here when approved audio is linked."), true);
});

test("duplicate normalization is case-insensitive but preserves ga characters", () => {
  assert.equal(isCaseInsensitiveWordDuplicate("three", "Three"), true);
  assert.equal(isCaseInsensitiveWordDuplicate("ete", "Ete"), true);
  assert.equal(normalizeWordForDuplicate("ete"), normalizeWordForDuplicate("Ete"));
  assert.notEqual(normalizeWordForDuplicate("ete"), normalizeWordForDuplicate("ɛte"));
  assert.notEqual(normalizeWordForDuplicate("oko"), normalizeWordForDuplicate("ɔko"));
  assert.notEqual(normalizeWordForDuplicate("nga"), normalizeWordForDuplicate("ŋga"));
});