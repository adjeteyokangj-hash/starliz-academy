import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHomeworkLifecycleSignals,
  buildHomeworkMasteryPlan,
} from "../src/lib/homework-phase1g/intelligence";

test("HEART BEAT pending signal after homework generation", () => {
  const signals = buildHomeworkLifecycleSignals({
    featureEnabled: true,
    status: "GENERATED",
    scorePercent: null,
    reviewNeededCount: 0,
    requiresRecap: false,
  });

  assert.equal(signals.includes("homework_pending"), true);
  assert.equal(signals.includes("homework_generated"), true);
});

test("HEART BEAT started signal after draft/start", () => {
  const signals = buildHomeworkLifecycleSignals({
    featureEnabled: true,
    status: "STARTED",
    scorePercent: null,
    reviewNeededCount: 0,
    requiresRecap: false,
  });

  assert.equal(signals.includes("homework_started"), true);
});

test("HEART BEAT completed signal after marking", () => {
  const signals = buildHomeworkLifecycleSignals({
    featureEnabled: true,
    status: "COMPLETED",
    scorePercent: 84,
    reviewNeededCount: 0,
    requiresRecap: false,
  });

  assert.equal(signals.includes("homework_completed"), true);
});

test("HEART BEAT low-score signal", () => {
  const signals = buildHomeworkLifecycleSignals({
    featureEnabled: true,
    status: "COMPLETED",
    scorePercent: 42,
    reviewNeededCount: 0,
    requiresRecap: true,
  });

  assert.equal(signals.includes("low_homework_score"), true);
});

test("HEART BEAT review-needed signal", () => {
  const signals = buildHomeworkLifecycleSignals({
    featureEnabled: true,
    status: "REVIEW_NEEDED",
    scorePercent: null,
    reviewNeededCount: 1,
    requiresRecap: false,
  });

  assert.equal(signals.includes("review_needed"), true);
});

test("HEART BEAT override/excuse signal", () => {
  const overrideSignals = buildHomeworkLifecycleSignals({
    featureEnabled: true,
    status: "OVERRIDDEN",
    scorePercent: null,
    reviewNeededCount: 0,
    requiresRecap: false,
    includeParentAdminOverride: true,
  });
  const excuseSignals = buildHomeworkLifecycleSignals({
    featureEnabled: true,
    status: "EXCUSED",
    scorePercent: null,
    reviewNeededCount: 0,
    requiresRecap: false,
    includeExcused: true,
  });

  assert.equal(overrideSignals.includes("parent_admin_override"), true);
  assert.equal(excuseSignals.includes("homework_excused"), true);
});

test("Mastery Map improves after strong homework result", () => {
  const plan = buildHomeworkMasteryPlan({
    featureEnabled: true,
    status: "COMPLETED",
    scorePercent: 88,
    reviewNeededCount: 0,
    requiresRecap: false,
    targets: [{ subject: "Math", skillFocus: "Fractions" }],
  });

  assert.equal(plan.resolveTargets.length, 1);
  assert.equal(plan.activateTargets.length, 0);
  assert.equal(plan.homeworkHelpedProgress, true);
});

test("weak homework result keeps/creates recap recommendation", () => {
  const plan = buildHomeworkMasteryPlan({
    featureEnabled: true,
    status: "COMPLETED",
    scorePercent: 49,
    reviewNeededCount: 0,
    requiresRecap: true,
    targets: [{ subject: "English", skillFocus: "Inference" }],
  });

  assert.equal(plan.activateTargets.length, 1);
  assert.equal(plan.activateTargets[0]?.reason, "low_score_recap");
  assert.equal(plan.recapOnlyPath, true);
});

test("under-50 result produces recap-only learning path", () => {
  const plan = buildHomeworkMasteryPlan({
    featureEnabled: true,
    status: "COMPLETED",
    scorePercent: 37,
    reviewNeededCount: 0,
    requiresRecap: true,
    targets: [{ subject: "Science", skillFocus: "Photosynthesis" }],
  });

  assert.equal(plan.recapOnlyPath, true);
  assert.equal(plan.homeworkHelpedProgress, false);
});

test("review-needed result does not falsely improve mastery", () => {
  const plan = buildHomeworkMasteryPlan({
    featureEnabled: true,
    status: "REVIEW_NEEDED",
    scorePercent: null,
    reviewNeededCount: 2,
    requiresRecap: false,
    targets: [{ subject: "Science", skillFocus: "Explanation" }],
  });

  assert.equal(plan.resolveTargets.length, 0);
  assert.equal(plan.activateTargets.length, 1);
  assert.equal(plan.homeworkHelpedProgress, false);
});

test("feature flag off prevents homework intelligence changes", () => {
  const signals = buildHomeworkLifecycleSignals({
    featureEnabled: false,
    status: "COMPLETED",
    scorePercent: 95,
    reviewNeededCount: 0,
    requiresRecap: false,
  });
  const plan = buildHomeworkMasteryPlan({
    featureEnabled: false,
    status: "COMPLETED",
    scorePercent: 95,
    reviewNeededCount: 0,
    requiresRecap: false,
    targets: [{ subject: "Math", skillFocus: "Fractions" }],
  });

  assert.equal(signals.length, 0);
  assert.equal(plan.resolveTargets.length, 0);
  assert.equal(plan.activateTargets.length, 0);
  assert.equal(plan.recapOnlyPath, false);
});
