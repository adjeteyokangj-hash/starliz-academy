import test from "node:test";
import assert from "node:assert/strict";

import { buildMasteryMap } from "../src/lib/academic-intelligence/masteryMap";
import { detectCatchUpTriggers, buildCatchUpRecommendations } from "../src/lib/academic-intelligence/catchUpPlanner";
import { buildAssessmentRecommendations } from "../src/lib/academic-intelligence/assessmentEngine";
import { buildAcademicIntelligence, toStudentSafeAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import { mapHeartbeatActionButton, toHeartbeatDecisionViewModel } from "../src/lib/academic-intelligence/heartbeatActionMap";
import type { AcademicSourceData, CatchUpTaskRecord, CoachHeartbeatSignalSummary } from "../src/lib/academic-intelligence/types";

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

function withCompletedQlf(source: AcademicSourceData): AcademicSourceData {
  return {
    ...source,
    quickLevelFinderBaseline: {
      completedAt: new Date().toISOString(),
      yearGroup: source.yearGroup ?? "Year 10",
      keyStage: source.keyStage ?? "KS4",
      confidenceLabel: "baseline_placement_signal",
      parentSubjectScores: [
        { subject: "math", accuracy: 75, level: "secure" },
      ],
      englishStrandScores: [
        { strand: "reading", accuracy: 70, level: "secure" },
      ],
    },
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

test("heartbeat decision uses review_placement when QLF is not completed", () => {
  const output = buildAcademicIntelligence(baseSource({
    attempts: [
      {
        id: "at-qlf-1",
        subject: "math",
        topic: "Algebra",
        skill: "linear_equations",
        correct: true,
        hintsUsed: 0,
        createdAt: new Date().toISOString(),
        score: 88,
      },
    ],
  }));

  assert.equal(output.heartbeatDecision.primaryAction, "review_placement");
});

test("heartbeat decision prioritises catch-up when active catch-up exists", () => {
  const source = withCompletedQlf(baseSource({
    attempts: Array.from({ length: 6 }).map((_, index) => ({
      id: `at-catchup-${index}`,
      subject: "science",
      topic: "Cells",
      skill: "cell_structure",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 90,
    })),
    assignments: [
      {
        id: "assign-catchup-1",
        status: "completed",
        subject: "science",
        topic: "Cells",
        skill: "cell_structure",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ],
  }));

  const existingCatchUpTasks: CatchUpTaskRecord[] = [
    {
      taskId: "task-active-1",
      studentId: source.studentId,
      recommendationId: "rec-active-1",
      title: "Cells catch-up",
      subject: "science",
      topic: "Cells",
      skill: "cell_structure",
      status: "active",
      priority: "high",
      estimatedMinutes: 25,
      dueDate: null,
      scheduledDay: null,
      routeTarget: "/student/dashboard",
      sourceTrigger: "active_weak_area",
      note: null,
      metadata: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const output = buildAcademicIntelligence(source, { existingCatchUpTasks });
  assert.equal(output.heartbeatDecision.primaryAction, "assign_catch_up");
});

test("heartbeat decision assigns catch-up for weak mastery", () => {
  const output = buildAcademicIntelligence(withCompletedQlf(baseSource({
    attempts: Array.from({ length: 4 }).map((_, index) => ({
      id: `at-weak-${index}`,
      subject: "reading",
      topic: "Inference",
      skill: "inference",
      correct: false,
      hintsUsed: 2,
      createdAt: new Date().toISOString(),
      score: 25,
    })),
  })));

  assert.equal(output.heartbeatDecision.primaryAction, "assign_catch_up");
});

test("heartbeat decision advances student for strong mastery and no blockers", () => {
  const source = withCompletedQlf(baseSource({
    attempts: Array.from({ length: 8 }).map((_, index) => ({
      id: `at-strong-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "fractions",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 95,
    })),
    assignments: [
      {
        id: "assign-strong-1",
        status: "completed",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ],
  }));

  const output = buildAcademicIntelligence(source);
  assert.equal(output.heartbeatDecision.primaryAction, "advance_student");
});

test("heartbeat decision resolves conflicting signals using the safest action", () => {
  const source = withCompletedQlf(baseSource({
    attempts: Array.from({ length: 7 }).map((_, index) => ({
      id: `at-conflict-${index}`,
      subject: "science",
      topic: "Forces",
      skill: "forces",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 90,
    })),
    assignments: [
      {
        id: "assign-conflict-1",
        status: "completed",
        subject: "science",
        topic: "Forces",
        skill: "forces",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ],
  }));

  const existingCatchUpTasks: CatchUpTaskRecord[] = [
    {
      taskId: "task-conflict-1",
      studentId: source.studentId,
      recommendationId: "rec-conflict-1",
      title: "Forces catch-up",
      subject: "science",
      topic: "Forces",
      skill: "forces",
      status: "active",
      priority: "medium",
      estimatedMinutes: 20,
      dueDate: null,
      scheduledDay: null,
      routeTarget: "/student/dashboard",
      sourceTrigger: "active_weak_area",
      note: null,
      metadata: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const output = buildAcademicIntelligence(source, { existingCatchUpTasks });
  assert.equal(output.heartbeatDecision.primaryAction, "assign_catch_up");
  assert.ok(output.heartbeatDecision.reasons.some((reason) => reason.toLowerCase().includes("safest")));
});

test("heartbeat action mapping returns expected routes for required actions", () => {
  const studentId = "student-123";
  const parentId = "parent-987";

  assert.equal(
    mapHeartbeatActionButton({ action: "review_placement", studentId, parentId }).href,
    "/admin/students/student-123",
  );
  assert.equal(
    mapHeartbeatActionButton({ action: "assign_catch_up", studentId, parentId }).href,
    "/admin/assignments?studentId=student-123&context=catch_up",
  );
  assert.equal(
    mapHeartbeatActionButton({ action: "generate_revision", studentId, parentId }).href,
    "/admin/knowledge-graph?mode=academic_intelligence&studentId=student-123&tab=recommendations",
  );
  assert.equal(
    mapHeartbeatActionButton({ action: "generate_assessment", studentId, parentId }).label,
    "Open assessment readiness",
  );
  assert.equal(
    mapHeartbeatActionButton({ action: "trigger_tutor_intervention", studentId, parentId }).href,
    "/admin/students/student-123#weak-areas",
  );
  assert.equal(
    mapHeartbeatActionButton({ action: "trigger_parent_alert", studentId, parentId }).href,
    "/admin/parents/parent-987",
  );
  assert.equal(
    mapHeartbeatActionButton({ action: "advance_student", studentId, parentId }).href,
    "/admin/students/student-123#subject-progression",
  );
});

test("heartbeat decision view model safely renders when decision is missing", () => {
  const view = toHeartbeatDecisionViewModel(null);
  assert.equal(view.action, "not available");
  assert.equal(view.confidence, "-");
  assert.ok(view.suggestedNextStep.toLowerCase().includes("compute") || view.suggestedNextStep.toLowerCase().includes("run"));
  assert.ok(view.reasonsSummary.toLowerCase().includes("no decision"));
});

test("academic intelligence output remains stable with empty coach signal summary", () => {
  const source = withCompletedQlf(baseSource({
    attempts: Array.from({ length: 8 }).map((_, index) => ({
      id: `at-stable-${index}`,
      subject: "math",
      topic: "Fractions",
      skill: "fractions",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 94,
    })),
  }));

  const withoutSignals = buildAcademicIntelligence(source);
  const emptySignals: CoachHeartbeatSignalSummary = {
    windowDays: 14,
    totalCoachSignals: 0,
    understoodAfterHelpCount: 0,
    stillStrugglingCount: 0,
    repeatedWeakAreaCount: 0,
    needsCatchUpCount: 0,
    needsDifferentExplanationStyleCount: 0,
    needsLiveTutorSupportCount: 0,
    topSubjects: [],
    topStrands: [],
    topSkillTopics: [],
    latestSignalAt: null,
    hasCoachConcern: false,
    hasTutorEscalationSignal: false,
    hasCatchUpSignal: false,
  };

  const withEmptySignals = buildAcademicIntelligence(source, {
    coachHeartbeatSignals: emptySignals,
  });

  assert.equal(withoutSignals.heartbeatDecision.primaryAction, withEmptySignals.heartbeatDecision.primaryAction);
  assert.equal(withoutSignals.heartbeatDecision.urgency, withEmptySignals.heartbeatDecision.urgency);
  assert.equal(withoutSignals.heartbeatDecision.riskLevel, withEmptySignals.heartbeatDecision.riskLevel);
  assert.deepEqual(withEmptySignals.coachHeartbeatSignals, emptySignals);
});

test("academic intelligence includes coach signal summary and heartbeat coach evidence", () => {
  const source = withCompletedQlf(baseSource({
    attempts: Array.from({ length: 8 }).map((_, index) => ({
      id: `at-coach-${index}`,
      subject: "math",
      topic: "Multiplication",
      skill: "times_tables",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 90,
    })),
  }));

  const coachSignals: CoachHeartbeatSignalSummary = {
    windowDays: 14,
    totalCoachSignals: 5,
    understoodAfterHelpCount: 2,
    stillStrugglingCount: 3,
    repeatedWeakAreaCount: 2,
    needsCatchUpCount: 2,
    needsDifferentExplanationStyleCount: 1,
    needsLiveTutorSupportCount: 2,
    topSubjects: [{ value: "Maths", count: 5 }],
    topStrands: [{ value: "Number", count: 5 }],
    topSkillTopics: [{ value: "Multiplication", count: 5 }],
    latestSignalAt: new Date().toISOString(),
    hasCoachConcern: true,
    hasTutorEscalationSignal: true,
    hasCatchUpSignal: true,
  };

  const output = buildAcademicIntelligence(source, {
    coachHeartbeatSignals: coachSignals,
  });

  assert.equal(output.coachHeartbeatSignals?.totalCoachSignals, 5);
  assert.ok(output.heartbeatDecision.reasons.some((reason) => reason.includes("Coach support used recently")));
  assert.ok(output.heartbeatDecision.reasons.some((reason) => reason.includes("different explanation style")));
  assert.ok(output.heartbeatDecision.evidence.some((row) => row.includes("Coach signals")));
});

test("student-safe academic intelligence response does not expose coach heartbeat summary", () => {
  const source = withCompletedQlf(baseSource());
  const output = buildAcademicIntelligence(source, {
    coachHeartbeatSignals: {
      windowDays: 14,
      totalCoachSignals: 1,
      understoodAfterHelpCount: 1,
      stillStrugglingCount: 0,
      repeatedWeakAreaCount: 0,
      needsCatchUpCount: 0,
      needsDifferentExplanationStyleCount: 0,
      needsLiveTutorSupportCount: 0,
      topSubjects: [{ value: "Maths", count: 1 }],
      topStrands: [{ value: "Number", count: 1 }],
      topSkillTopics: [{ value: "Multiplication", count: 1 }],
      latestSignalAt: new Date().toISOString(),
      hasCoachConcern: false,
      hasTutorEscalationSignal: false,
      hasCatchUpSignal: false,
    },
  });

  const safe = toStudentSafeAcademicIntelligence(output) as Record<string, unknown>;
  assert.equal("coachHeartbeatSignals" in safe, false);
});
