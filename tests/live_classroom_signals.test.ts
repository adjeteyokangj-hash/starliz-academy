import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAiSupportState,
  deriveGlanceSignal,
  deriveHumanTutorEligible,
  deriveLearningState,
  deriveStudentRecovered,
  deriveStudentSignals,
  parseDaytimeTutorSkillFocus,
} from "../src/lib/schools/live-classroom-signals";

test("learning state: not-started when no assignments for stages", () => {
  assert.equal(
    deriveLearningState({
      stageContentIds: ["c1", "c2"],
      assignments: [],
      periodStillActive: true,
    }),
    "not-started",
  );
});

test("learning state: practice when all stages done and period active", () => {
  assert.equal(
    deriveLearningState({
      stageContentIds: ["c1"],
      assignments: [{
        id: "a1",
        contentId: "c1",
        status: "completed",
        completedAt: new Date(),
        stageIndex: 0,
      }],
      periodStillActive: true,
    }),
    "practice",
  );
});

test("ai support: exhausted when needsTeacher", () => {
  const result = deriveAiSupportState([
    {
      createdAt: new Date("2026-07-24T10:00:00Z"),
      source: "openai",
      needsTeacher: true,
      hintLevel: 4,
      assignmentId: "a1",
      questionKey: "q1",
    },
  ]);
  assert.equal(result.aiSupportState, "exhausted");
  assert.ok(result.exhaustedAt);
});

test("humanTutorEligible requires exhausted + unrecovered + active assignment + active period", () => {
  assert.equal(
    deriveHumanTutorEligible({
      aiSupportState: "exhausted",
      studentRecovered: false,
      assignmentStillActive: true,
      periodStillActive: true,
    }),
    true,
  );
  assert.equal(
    deriveHumanTutorEligible({
      aiSupportState: "exhausted",
      studentRecovered: true,
      assignmentStillActive: true,
      periodStillActive: true,
    }),
    false,
  );
  assert.equal(
    deriveHumanTutorEligible({
      aiSupportState: "struggling",
      studentRecovered: false,
      assignmentStillActive: true,
      periodStillActive: true,
    }),
    false,
  );
});

test("studentRecovered after correct attempt following exhaustion", () => {
  const exhaustedAt = new Date("2026-07-24T10:00:00Z");
  assert.equal(
    deriveStudentRecovered({
      exhaustedAt,
      helpEvents: [{
        createdAt: exhaustedAt,
        source: "fallback",
        needsTeacher: true,
        hintLevel: 5,
        assignmentId: "a1",
        questionKey: "q1",
      }],
      attempts: [{
        createdAt: new Date("2026-07-24T10:05:00Z"),
        correct: true,
        assignmentId: "a1",
        contentId: "c1",
        questionText: "Where did the fox pause?",
      }],
      assignments: [{
        id: "a1",
        contentId: "c1",
        status: "assigned",
        completedAt: null,
      }],
    }),
    true,
  );
});

test("glance signal prefers teacher required over struggling", () => {
  assert.equal(
    deriveGlanceSignal({ humanTutorEligible: true, aiSupportState: "exhausted" }),
    "TEACHER_REQUIRED",
  );
  assert.equal(
    deriveGlanceSignal({ humanTutorEligible: false, aiSupportState: "struggling" }),
    "AI_STRUGGLING",
  );
});

test("full signals: intervene only when eligible; drawer always allowed", () => {
  const signals = deriveStudentSignals({
    stageContentIds: ["c1"],
    assignments: [{
      id: "a1",
      contentId: "c1",
      status: "assigned",
      completedAt: null,
      stageIndex: 0,
    }],
    attempts: [{
      createdAt: new Date("2026-07-24T09:55:00Z"),
      correct: false,
      assignmentId: "a1",
      contentId: "c1",
      questionText: "q",
    }],
    helpEvents: [{
      createdAt: new Date("2026-07-24T10:00:00Z"),
      source: "fallback",
      needsTeacher: true,
      hintLevel: 5,
      assignmentId: "a1",
      questionKey: "q1",
    }],
    periodStillActive: true,
  });

  assert.equal(signals.learningState, "learning");
  assert.equal(signals.aiSupportState, "exhausted");
  assert.equal(signals.teacherState, "intervene");
  assert.equal(signals.glanceSignal, "TEACHER_REQUIRED");
  assert.equal(signals.humanTutorEligible, true);
  assert.equal(signals.canOpenDrawer, true);
  assert.equal(signals.canJoinAsHumanTutor, true);
  assert.equal(signals.recoveryOutcome, "Teacher required");
});

test("exhausted but recovered keeps drawer open and locks join", () => {
  const signals = deriveStudentSignals({
    stageContentIds: ["c1"],
    assignments: [{
      id: "a1",
      contentId: "c1",
      status: "assigned",
      completedAt: null,
      stageIndex: 0,
    }],
    attempts: [{
      createdAt: new Date("2026-07-24T10:05:00Z"),
      correct: true,
      assignmentId: "a1",
      contentId: "c1",
      questionText: "q",
    }],
    helpEvents: [{
      createdAt: new Date("2026-07-24T10:00:00Z"),
      source: "openai",
      needsTeacher: true,
      hintLevel: 4,
      assignmentId: "a1",
      questionKey: "q1",
    }],
    periodStillActive: true,
  });

  assert.equal(signals.humanTutorEligible, false);
  assert.equal(signals.canJoinAsHumanTutor, false);
  assert.equal(signals.canOpenDrawer, true);
  assert.equal(signals.teacherState, "resolved");
  assert.equal(signals.recoveryOutcome, "Recovered");
});

test("parse daytime tutor skillFocus", () => {
  const parsed = parseDaytimeTutorSkillFocus("dts:period-1:asg-1:q1:conv-9");
  assert.deepEqual(parsed, {
    periodId: "period-1",
    assignmentId: "asg-1",
    questionKey: "q1",
    conversationId: "conv-9",
  });
});
