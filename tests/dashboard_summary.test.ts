import test from "node:test";
import assert from "node:assert/strict";
import {
  buildActiveLanguageModules,
  buildAssignedLanguageLessons,
  buildAssignedWorkSummary,
  buildSmartCoachSummary,
} from "../src/lib/student-dashboard-summary";
import { deriveStudentLearningState } from "../src/lib/student-learning-state";

test("dashboard summary chooses active assigned work as the next first-render activity", () => {
  const summary = buildAssignedWorkSummary([
    { id: "done", status: "completed", subject: "maths", title: "Completed maths", href: "/games/math?assignmentId=done" },
    { id: "next", status: "assigned", subject: "reading", title: "Reading inference", href: "/games/reading?assignmentId=next" },
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.active, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.nextTitle, "Reading inference");
  assert.equal(summary.nextActivity?.assignmentId, "next");
});

test("dashboard summary falls back cleanly when no assigned work exists", () => {
  const summary = buildAssignedWorkSummary([]);

  assert.equal(summary.total, 0);
  assert.equal(summary.nextTitle, null);
  assert.equal(summary.nextActivity, null);
});

test("smart coach dashboard summary stays compact for the first render", () => {
  const pending = buildSmartCoachSummary({
    skills: [{ status: "weak" }],
    hasLearningTwinData: false,
  });
  const ready = buildSmartCoachSummary({
    skills: [{ status: "mastered" }],
    hasLearningTwinData: true,
    bestExplanationStyle: "visual_examples",
  });

  assert.equal(pending.status, "pending");
  assert.match(pending.headline, /still learning/);
  assert.equal(ready.status, "ready");
  assert.equal(ready.masteredCount, 1);
});

test("dashboard state treats completed Level Finder as placed without manual refresh", () => {
  const state = deriveStudentLearningState({
    assignmentCount: 2,
    selectedSubjects: ["maths", "english", "science"],
    skillAttempts: 0,
    progressEvents: 0,
    weakAreaCount: 0,
    masteredSkills: 0,
    spellingAttempts: 0,
    readingAttempts: 0,
    speechSamples: 0,
    placementResponses: 12,
    placementCompleted: true,
  });

  assert.equal(state.isFirstTimeStudent, false);
  assert.equal(state.hasCompletedPlacement, true);
  assert.equal(state.onboardingStage, "LEARNING");
});

test("language modules stay hidden when no active language assignments exist", () => {
  const modules = buildActiveLanguageModules([
    { id: "done-1", status: "completed", subject: "ga", title: "Ga greeting review", href: "/ga-learning-hub" },
  ]);

  assert.deepEqual(modules, []);
});

test("active Ga assignments produce Ga Learning Hub module", () => {
  const modules = buildActiveLanguageModules([
    { id: "ga-1", status: "assigned", subject: "ga", title: "Ga greetings", href: "/ga-learning-hub" },
    { id: "ga-2", status: "in_progress", subject: "ga", title: "Ga numbers", href: "/ga-learning-hub" },
  ]);

  assert.equal(modules.length, 1);
  assert.equal(modules[0]?.id, "ga-learning-hub");
  assert.equal(modules[0]?.activeAssignments, 2);
  assert.equal(modules[0]?.href, "/ga-learning-hub");
});

test("assigned language lesson summary supports future language subjects", () => {
  const lessons = buildAssignedLanguageLessons([
    { id: "ga-1", status: "assigned", subject: "ga", title: "Ga greetings", href: "/ga-learning-hub" },
    { id: "en-1", status: "assigned", subject: "english", title: "Reading task", href: "/games/reading?assignmentId=en-1" },
  ]);

  assert.equal(lessons.length, 1);
  assert.equal(lessons[0]?.language, "ga");
  assert.equal(lessons[0]?.assignmentId, "ga-1");
});
