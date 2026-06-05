import test from "node:test";
import assert from "node:assert/strict";

import { evaluateWeeklyHomeworkEligibility } from "../src/lib/homework-phase1a/eligibility";
import { workloadCapForYearGroup } from "../src/lib/homework-phase1a/workloadCap";
import { generateWeeklyHomeworkBatch } from "../src/lib/homework-phase1a/generation";
import {
  applyAdminHomeworkAction,
  createGeneratedBatchState,
  isQuestionSetFrozen,
  markHomework,
  saveDraftAnswer,
  startHomework,
  submitHomework,
} from "../src/lib/homework-phase1a/stateTransitions";
import { evaluateHomeworkSessionGate } from "../src/lib/homework-phase1a/gate";
import type { WeeklyWeaknessCandidate } from "../src/lib/homework-phase1a/types";

const FRIDAY_UTC_NOON = new Date("2025-05-16T12:00:00.000Z");
const THURSDAY_UTC_NOON = new Date("2025-05-15T12:00:00.000Z");

function makeWeakness(id: string, estimatedMinutes: number, repeatedMistakes: number): WeeklyWeaknessCandidate {
  return {
    id,
    subject: "maths",
    topic: "fractions",
    skill: "equivalent fractions",
    estimatedMinutes,
    repeatedMistakes,
    averageScore: 42,
    coreTopicWeakness: true,
    masteryGap: true,
    coachUsageCount: 2,
    completionIssueCount: 1,
    previousHomeworkWeakness: false,
  };
}

test("no completed sessions => no homework", () => {
  const eligibility = evaluateWeeklyHomeworkEligibility({
    now: FRIDAY_UTC_NOON,
    timezone: "Europe/London",
    completedSessionCount: 0,
    startedSessionCount: 0,
    existingBatchForWeek: false,
  });

  assert.equal(eligibility.status, "NOT_ELIGIBLE");
  assert.equal(eligibility.reason, "NO_COMPLETED_SESSIONS");
});

test("one completed session on Friday => eligible", () => {
  const eligibility = evaluateWeeklyHomeworkEligibility({
    now: FRIDAY_UTC_NOON,
    timezone: "Europe/London",
    completedSessionCount: 1,
    startedSessionCount: 1,
    existingBatchForWeek: false,
  });

  assert.equal(eligibility.status, "ELIGIBLE");
  assert.equal(eligibility.reason, "ELIGIBLE_FOR_GENERATION");
});

test("duplicate weekly generation prevention", () => {
  const result = generateWeeklyHomeworkBatch({
    now: FRIDAY_UTC_NOON,
    timezone: "Europe/London",
    studentId: "student-1",
    yearGroup: "Year 5",
    completedSessionCount: 2,
    startedSessionCount: 2,
    existingBatchForWeek: true,
    weaknesses: [makeWeakness("w1", 10, 4)],
  });

  assert.equal(result.created, false);
  if (!result.created) {
    assert.equal(result.reason, "ALREADY_GENERATED");
    assert.equal(result.auditEvents[0]?.action, "generation_skipped");
  }
});

test("workload caps by year group are enforced", () => {
  const cap = workloadCapForYearGroup("Year 3");
  assert.deepEqual(cap, { minMinutes: 10, maxMinutes: 15 });

  const result = generateWeeklyHomeworkBatch({
    now: FRIDAY_UTC_NOON,
    timezone: "Europe/London",
    studentId: "student-2",
    yearGroup: "Year 3",
    completedSessionCount: 2,
    startedSessionCount: 2,
    existingBatchForWeek: false,
    weaknesses: [
      makeWeakness("w1", 10, 5),
      makeWeakness("w2", 6, 4),
      makeWeakness("w3", 6, 3),
    ],
  });

  assert.equal(result.created, true);
  if (result.created) {
    assert.ok(result.batch.plannedMinutes <= cap.maxMinutes);
  }
});

test("homework questions carry lower target learning year while workload cap uses student year", () => {
  const cap = workloadCapForYearGroup("Year 4");
  const result = generateWeeklyHomeworkBatch({
    now: FRIDAY_UTC_NOON,
    timezone: "Europe/London",
    studentId: "student-year-4",
    yearGroup: "Year 4",
    completedSessionCount: 2,
    startedSessionCount: 2,
    existingBatchForWeek: false,
    weaknesses: [{
      ...makeWeakness("grammar-year-2", 10, 5),
      subject: "english",
      topic: "grammar",
      skill: "sentence structure",
      targetLearningYearGroup: "Year 2",
      targetLearningKeyStage: "KS1",
      studentYearGroup: "Year 4",
    }],
  });

  assert.equal(result.created, true);
  if (result.created) {
    assert.equal(result.batch.workloadCapMinutes, cap.maxMinutes);
    assert.equal(result.batch.questions[0]?.targetLearningYearGroup, "Year 2");
    assert.equal(result.batch.questions[0]?.targetLearningKeyStage, "KS1");
    assert.equal(result.batch.questions[0]?.studentYearGroup, "Year 4");
  }
});

test("freeze after start", () => {
  const initial = createGeneratedBatchState(["q1", "q2"]);
  assert.equal(isQuestionSetFrozen(initial), false);

  const started = startHomework(initial, FRIDAY_UTC_NOON);
  assert.equal(started.state.status, "STARTED");
  assert.equal(isQuestionSetFrozen(started.state), true);
  assert.equal(started.audit[0]?.action, "start");
});

test("draft save no marking", () => {
  const initial = createGeneratedBatchState(["q1", "q2"]);
  const draft = saveDraftAnswer(initial, "q1", FRIDAY_UTC_NOON);

  assert.equal(draft.state.status, "IN_PROGRESS");
  assert.equal(draft.marked, false);
  assert.equal(draft.state.scorePercent, null);
  assert.ok(draft.audit.some((event) => event.action === "draft_save"));
});

test("submit requires required answers", () => {
  const initial = createGeneratedBatchState(["q1", "q2"]);
  const draft = saveDraftAnswer(initial, "q1", FRIDAY_UTC_NOON);

  const submitAttempt = submitHomework(draft.state, FRIDAY_UTC_NOON);
  assert.equal(submitAttempt.ok, false);
  if (!submitAttempt.ok) {
    assert.ok(submitAttempt.error.includes("required"));
  }
});

test("pending blocks new session only", () => {
  const state = {
    ...createGeneratedBatchState(["q1"]),
    status: "IN_PROGRESS" as const,
    frozenAtIso: FRIDAY_UTC_NOON.toISOString(),
  };

  const gate = evaluateHomeworkSessionGate(state);
  assert.equal(gate.blockNewLearningSession, true);
  assert.equal(gate.allowRecapCatchUpOnly, false);
});

test("completed/excused/overridden unlock", () => {
  const completedGate = evaluateHomeworkSessionGate({
    ...createGeneratedBatchState(["q1"]),
    status: "COMPLETED",
  });
  const excusedGate = evaluateHomeworkSessionGate({
    ...createGeneratedBatchState(["q1"]),
    status: "EXCUSED",
  });
  const overriddenGate = evaluateHomeworkSessionGate({
    ...createGeneratedBatchState(["q1"]),
    status: "OVERRIDDEN",
  });

  assert.equal(completedGate.blockNewLearningSession, false);
  assert.equal(excusedGate.blockNewLearningSession, false);
  assert.equal(overriddenGate.blockNewLearningSession, false);
});

test("under-50 recap-only path", () => {
  const initial = createGeneratedBatchState(["q1"]);
  const draft = saveDraftAnswer(initial, "q1", FRIDAY_UTC_NOON);
  const submit = submitHomework(draft.state, FRIDAY_UTC_NOON);
  assert.equal(submit.ok, true);
  if (!submit.ok) return;

  const marked = markHomework(submit.state, FRIDAY_UTC_NOON, 45, false);
  const gate = evaluateHomeworkSessionGate(marked.state);

  assert.equal(marked.state.recapOnly, true);
  assert.equal(gate.blockNewLearningSession, true);
  assert.equal(gate.allowRecapCatchUpOnly, true);
});

test("override reason required", () => {
  const initial = createGeneratedBatchState(["q1"]);
  const noReason = applyAdminHomeworkAction(initial, FRIDAY_UTC_NOON, "override", "");
  assert.equal(noReason.ok, false);

  const withReason = applyAdminHomeworkAction(initial, FRIDAY_UTC_NOON, "override", "Parent approved alternative learning evidence");
  assert.equal(withReason.ok, true);
  if (withReason.ok) {
    assert.equal(withReason.state.status, "OVERRIDDEN");
  }
});

test("audit events are produced", () => {
  const generated = generateWeeklyHomeworkBatch({
    now: FRIDAY_UTC_NOON,
    timezone: "Europe/London",
    studentId: "student-3",
    yearGroup: "Year 6",
    completedSessionCount: 2,
    startedSessionCount: 2,
    existingBatchForWeek: false,
    weaknesses: [makeWeakness("w1", 8, 4)],
  });

  assert.equal(generated.created, true);
  if (generated.created) {
    assert.equal(generated.auditEvents[0]?.action, "generation");
  }

  const base = createGeneratedBatchState(["q1"]);
  const start = startHomework(base, THURSDAY_UTC_NOON);
  const draft = saveDraftAnswer(start.state, "q1", THURSDAY_UTC_NOON);
  const submit = submitHomework(draft.state, THURSDAY_UTC_NOON);

  assert.ok(start.audit.length > 0);
  assert.ok(draft.audit.some((event) => event.action === "draft_save"));
  assert.equal(submit.ok, true);
  if (submit.ok) {
    assert.equal(submit.audit[0]?.action, "submit");
  }
});
