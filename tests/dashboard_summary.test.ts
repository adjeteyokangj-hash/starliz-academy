import test from "node:test";
import assert from "node:assert/strict";
import { buildAssignedWorkSummary, buildSmartCoachSummary } from "../src/lib/student-dashboard-summary";
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
