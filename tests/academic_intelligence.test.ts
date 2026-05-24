import test from "node:test";
import assert from "node:assert/strict";

import { buildMasteryMap } from "../src/lib/academic-intelligence/masteryMap";
import { detectCatchUpTriggers, buildCatchUpRecommendations } from "../src/lib/academic-intelligence/catchUpPlanner";
import { buildAssessmentRecommendations } from "../src/lib/academic-intelligence/assessmentEngine";
import { buildAcademicIntelligence, toStudentSafeAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import type { AcademicSourceData } from "../src/lib/academic-intelligence/types";

function baseSource(overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  return {
    studentId: "student-1",
    yearGroup: "Year 10",
    keyStage: "KS4",
    examBoard: "AQA",
    assignments: [],
    attempts: [],
    weakAreas: [],
    studentSkills: [],
    coachUsage: [],
    dictionarySignals: [],
    progressRecords: [],
    assessmentHistory: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("high score and completed work produces nearly_secure/mastered", () => {
  const source = baseSource({
    assignments: [
      {
        id: "a1",
        status: "completed",
        subject: "math",
        topic: "Algebra",
        skill: "linear_equations",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ],
    attempts: Array.from({ length: 6 }).map((_, index) => ({
      id: `at-${index}`,
      subject: "math",
      topic: "Algebra",
      skill: "linear_equations",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 95,
    })),
  });

  const result = buildMasteryMap(source);
  assert.ok(result.masteryMap.length >= 1);
  const status = result.masteryMap[0].masteryStatus;
  assert.ok(status === "nearly_secure" || status === "mastered");
});

test("low score produces needs_catch_up", () => {
  const source = baseSource({
    attempts: Array.from({ length: 5 }).map((_, index) => ({
      id: `at-${index}`,
      subject: "reading",
      topic: "Inference",
      skill: "inference",
      correct: false,
      hintsUsed: 2,
      createdAt: new Date().toISOString(),
      score: 20,
    })),
  });

  const result = buildMasteryMap(source);
  assert.equal(result.masteryMap[0]?.masteryStatus, "needs_catch_up");
});

test("old completed work produces needs_revision", () => {
  const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const source = baseSource({
    assignments: [
      {
        id: "a1",
        status: "completed",
        subject: "science",
        topic: "Cells",
        skill: "cell_structure",
        createdAt: oldDate,
        updatedAt: oldDate,
        completedAt: oldDate,
      },
    ],
    attempts: [
      {
        id: "at-1",
        subject: "science",
        topic: "Cells",
        skill: "cell_structure",
        correct: true,
        hintsUsed: 0,
        createdAt: oldDate,
        score: 80,
      },
    ],
  });

  const result = buildMasteryMap(source);
  assert.equal(result.masteryMap[0]?.masteryStatus, "needs_revision");
});

test("active weak area prevents mastered status", () => {
  const source = baseSource({
    attempts: Array.from({ length: 7 }).map((_, index) => ({
      id: `at-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "fractions",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 92,
    })),
    weakAreas: [
      {
        id: "w1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        status: "active",
        lastDetectedAt: new Date().toISOString(),
      },
    ],
  });

  const result = buildMasteryMap(source);
  assert.notEqual(result.masteryMap[0]?.masteryStatus, "mastered");
});

test("missing data does not crash and returns empty-safe output", () => {
  const output = buildAcademicIntelligence(baseSource());
  assert.equal(output.studentId, "student-1");
  assert.ok(Array.isArray(output.masteryMap));
  assert.ok(Array.isArray(output.catchUpRecommendations));
});

test("low quiz score style performance creates catch-up trigger and recommendation", () => {
  const source = baseSource({
    attempts: [
      {
        id: "at-1",
        subject: "reading",
        topic: "Comprehension",
        skill: "comprehension",
        correct: false,
        hintsUsed: 1,
        createdAt: new Date().toISOString(),
        score: 30,
      },
    ],
  });

  const mastery = buildMasteryMap(source);
  const triggers = detectCatchUpTriggers({ masteryMap: mastery.masteryMap, coverageMap: mastery.curriculumCoverage });
  const recs = buildCatchUpRecommendations({ triggers });
  assert.ok(triggers.some((t) => t.triggerType === "low_attempt_score"));
  assert.ok(recs.some((r) => r.taskType === "quiz_retry" || r.taskType === "targeted_practice" || r.taskType === "reading_support"));
});

test("active weak area and difficult dictionary create expected catch-up tasks", () => {
  const source = baseSource({
    weakAreas: [
      {
        id: "w1",
        subject: "reading",
        topic: "Vocabulary",
        skill: "vocab",
        status: "active",
        lastDetectedAt: new Date().toISOString(),
      },
    ],
    dictionarySignals: [
      {
        word: "metaphor",
        subject: "reading",
        topic: "Vocabulary",
        skill: "vocab",
        difficult: true,
        weak: true,
      },
    ],
  });

  const mastery = buildMasteryMap(source);
  const triggers = detectCatchUpTriggers({ masteryMap: mastery.masteryMap, coverageMap: mastery.curriculumCoverage });
  const recs = buildCatchUpRecommendations({ triggers });
  assert.ok(triggers.some((t) => t.triggerType === "active_weak_area"));
  assert.ok(recs.some((r) => r.taskType === "dictionary_review"));
});

test("prioritisation limits overload", () => {
  const source = baseSource({
    attempts: Array.from({ length: 20 }).map((_, index) => ({
      id: `at-${index}`,
      subject: "math",
      topic: `Topic ${index}`,
      skill: `skill-${index}`,
      correct: false,
      hintsUsed: 3,
      createdAt: new Date().toISOString(),
      score: 10,
    })),
  });
  const mastery = buildMasteryMap(source);
  const triggers = detectCatchUpTriggers({ masteryMap: mastery.masteryMap, coverageMap: mastery.curriculumCoverage });
  const recs = buildCatchUpRecommendations({ triggers, maxTasks: 5 });
  assert.ok(recs.length <= 5);
});

test("weak topic and KS4 context creates GCSE readiness recommendation", () => {
  const source = baseSource({
    attempts: [
      {
        id: "at-1",
        subject: "gcse-english",
        topic: "Poetry comparison",
        skill: "compare",
        correct: false,
        hintsUsed: 2,
        createdAt: new Date().toISOString(),
        score: 40,
      },
    ],
  });

  const mastery = buildMasteryMap(source);
  const assessment = buildAssessmentRecommendations({
    masteryMap: mastery.masteryMap,
    coverageMap: mastery.curriculumCoverage,
    catchUpTriggers: [],
  });

  assert.ok(assessment.gcseReadiness?.applicable);
  assert.ok(assessment.recommendations.some((item) => item.assessmentType === "gcse_style_question"));
});

test("low assessment readiness triggers catch-up via assessment engine", () => {
  const source = baseSource({
    attempts: [
      {
        id: "at-1",
        subject: "math",
        topic: "Percentages",
        skill: "percentages",
        correct: false,
        hintsUsed: 1,
        createdAt: new Date().toISOString(),
        score: 35,
      },
    ],
  });
  const mastery = buildMasteryMap(source);
  const assessment = buildAssessmentRecommendations({
    masteryMap: mastery.masteryMap,
    coverageMap: mastery.curriculumCoverage,
    catchUpTriggers: [],
  });
  assert.ok(assessment.assessmentLinkedCatchUpTriggers.some((item) => item.triggerType === "assessment_below_readiness"));
});

test("student API formatter returns safe response shape", () => {
  const output = buildAcademicIntelligence(baseSource({
    attempts: [{
      id: "at-1",
      subject: "reading",
      topic: "Inference",
      skill: "inference",
      correct: false,
      hintsUsed: 2,
      createdAt: new Date().toISOString(),
      score: 30,
    }],
  }));

  const safe = toStudentSafeAcademicIntelligence(output);
  assert.ok("summary" in safe);
  assert.ok(Array.isArray(safe.catchUpRecommendations));
  assert.ok(Array.isArray(safe.assessmentRecommendations));
  assert.ok(typeof safe.examReadinessProfile.score === "number");
  assert.ok(Array.isArray(safe.schoolWeekModePlan.days));
  assert.ok(typeof safe.masteryExpansion.masteredTopics === "number");
  assert.ok(Array.isArray(safe.curriculumCoverage));
  assert.ok(Array.isArray(safe.nextRecommendedActions));
});

test("admin-depth output contains triggers, report notes, and review actions", () => {
  const output = buildAcademicIntelligence(baseSource({
    attempts: [{
      id: "at-1",
      subject: "science",
      topic: "Forces",
      skill: "forces",
      correct: false,
      hintsUsed: 3,
      createdAt: new Date().toISOString(),
      score: 25,
    }],
  }));

  assert.ok(Array.isArray(output.catchUpTriggers));
  assert.ok(Array.isArray(output.reportNotes));
  assert.ok(Array.isArray(output.reviewActions));
  assert.ok(Array.isArray(output.auditHistoryDraft));
  assert.ok(typeof output.examReadinessProfile.score === "number");
  assert.ok(Array.isArray(output.schoolWeekModePlan.days));
  assert.ok(Array.isArray(output.masteryExpansion.priorityTopics));
});

test("exam readiness band and school week strategy adapt to weak performance", () => {
  const output = buildAcademicIntelligence(baseSource({
    attempts: [
      {
        id: "at-1",
        subject: "math",
        topic: "Algebra",
        skill: "linear_equations",
        correct: false,
        hintsUsed: 3,
        createdAt: new Date().toISOString(),
        score: 20,
      },
      {
        id: "at-2",
        subject: "reading",
        topic: "Inference",
        skill: "inference",
        correct: false,
        hintsUsed: 2,
        createdAt: new Date().toISOString(),
        score: 35,
      },
    ],
  }));

  assert.equal(output.examReadinessProfile.band, "not_ready");
  assert.ok(output.schoolWeekModePlan.strategy.toLowerCase().includes("foundation"));
  assert.ok(output.schoolWeekModePlan.days.length >= 5);
});

test("existing catch-up task status is respected in recommendation output", () => {
  const source = baseSource({
    attempts: [{
      id: "at-1",
      subject: "math",
      topic: "Algebra",
      skill: "linear_equations",
      correct: false,
      hintsUsed: 2,
      createdAt: new Date().toISOString(),
      score: 25,
    }],
  });

  const output = buildAcademicIntelligence(source, {
    existingCatchUpTasks: [{
      taskId: "catch-up-low-attempt-score-math-algebra-linear-equations",
      studentId: "student-1",
      recommendationId: "low-attempt-score-math-algebra-linear-equations",
      title: "Algebra catch-up",
      subject: "math",
      topic: "Algebra",
      skill: "linear_equations",
      status: "scheduled",
      priority: "high",
      estimatedMinutes: 15,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledDay: "Monday",
      routeTarget: "/student/dashboard",
      sourceTrigger: "low_attempt_score",
      note: null,
      metadata: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  });

  assert.ok(output.catchUpRecommendations.some((item) => item.status === "scheduled"));
  assert.ok(output.catchUpTasks.some((item) => item.status === "scheduled"));
});

test("fallback catch-up tasks are generated when no persisted tasks exist", () => {
  const output = buildAcademicIntelligence(baseSource({
    attempts: [{
      id: "at-1",
      subject: "reading",
      topic: "Inference",
      skill: "inference",
      correct: false,
      hintsUsed: 2,
      createdAt: new Date().toISOString(),
      score: 20,
    }],
  }));

  assert.ok(output.catchUpRecommendations.length > 0);
  assert.ok(output.catchUpTasks.length > 0);
  assert.equal(output.catchUpTasks[0]?.recommendationId, output.catchUpRecommendations[0]?.id);
});
