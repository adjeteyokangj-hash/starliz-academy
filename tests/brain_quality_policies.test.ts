import test from "node:test";
import assert from "node:assert/strict";

import { BRAIN_QUALITY_POLICIES } from "../src/lib/student-learning-brain/qualityPolicies";
import { classifyStudentDataState } from "../src/lib/student-learning-brain/studentDataNormalisation";
import { buildCatchUpRecommendations } from "../src/lib/academic-intelligence/catchUpPlanner";
import {
  buildStudentLearningBrainFromSource,
  toStudentDashboardBrainView,
} from "../src/lib/student-learning-brain";
import type { AcademicSourceData } from "../src/lib/academic-intelligence/types";

function emptySource(): AcademicSourceData {
  return {
    studentId: "policy-student",
    assignments: [],
    attempts: [],
    weakAreas: [],
    studentSkills: [],
    coachUsage: [],
    dictionarySignals: [],
    progressRecords: [],
    assessmentHistory: [],
    generatedAt: new Date().toISOString(),
  };
}

test("Brain quality policies stay read-only and honesty-first", () => {
  assert.equal(BRAIN_QUALITY_POLICIES.readOnly, true);
  assert.equal(BRAIN_QUALITY_POLICIES.honestyOverConfidence, true);
  assert.equal(BRAIN_QUALITY_POLICIES.requireEvidenceCitations, true);
  assert.ok(BRAIN_QUALITY_POLICIES.evidenceSourceRank.includes("attempt"));
});

test("data-state honesty flags insufficient_data for new profiles", () => {
  const state = classifyStudentDataState({
    attemptsCount: 0,
    progressRecordsCount: 0,
    assignmentsCount: 0,
    weakAreasCount: 0,
    sessionCount: 0,
    hasQuickLevelFinderCompleted: false,
    hasQuickLevelFinderSession: false,
    hasQuickLevelFinderPlacementSignal: false,
    hasAcademicSnapshot: false,
    hasLearningDna: false,
  });

  assert.equal(state.state, "new_no_activity");
  assert.equal(state.recommendationHonesty, "insufficient_data");
  assert.equal(state.confidenceBand, "insufficient");
  assert.ok(Array.isArray(state.evidenceCitations));
});

test("active QLF profiles get ready honesty with citations", () => {
  const state = classifyStudentDataState({
    attemptsCount: 4,
    progressRecordsCount: 1,
    assignmentsCount: 2,
    weakAreasCount: 1,
    sessionCount: 4,
    hasQuickLevelFinderCompleted: true,
    hasQuickLevelFinderSession: true,
    hasQuickLevelFinderPlacementSignal: true,
    hasAcademicSnapshot: true,
    hasLearningDna: true,
  });

  assert.equal(state.state, "active_with_qlf");
  assert.equal(state.recommendationHonesty, "ready");
  assert.equal(state.confidenceBand, "high");
  assert.ok(state.evidenceCitations?.some((row) => row.startsWith("attempts:")));
});

test("dashboard view exposes additive dataState honesty without dropping existing keys", () => {
  const brain = buildStudentLearningBrainFromSource({ source: emptySource() });
  const dashboard = toStudentDashboardBrainView(brain);

  assert.equal(dashboard.dataState.state, brain.dataState.state);
  assert.equal(dashboard.recommendationHonesty, "insufficient_data");
  assert.ok(dashboard.heartbeatSummary);
  assert.ok(dashboard.languageReadiness);
});

test("catch-up recommendations include evidence citations additively", () => {
  const recommendations = buildCatchUpRecommendations({
    triggers: [{
      triggerType: "active_weak_area",
      source: "weak_area",
      subject: "math",
      topic: "Fractions",
      skill: "fractions",
      priority: "high",
      evidenceSummary: "Active weak area still open for Fractions.",
      detectedAt: new Date().toISOString(),
    }],
  });

  assert.equal(recommendations.length, 1);
  assert.ok(recommendations[0].evidenceCitations?.length);
  assert.equal(typeof recommendations[0].insufficientData, "boolean");
  assert.equal(recommendations[0].reason, "Active weak area still open for Fractions.");
});
