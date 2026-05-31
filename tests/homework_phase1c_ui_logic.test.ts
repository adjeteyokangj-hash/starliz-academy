import test from "node:test";
import assert from "node:assert/strict";

import {
  homeworkStatusLabel,
  canSaveDraft,
  computeAnsweredCount,
  isSubmittable,
  extractPromptText,
  resolveHomeworkGateMessage,
  shouldShowHomeworkDashboardCard,
  WEEKLY_HOMEWORK_PENDING_MESSAGE,
  WEEKLY_HOMEWORK_SUPPORT_MESSAGE,
} from "../src/lib/homework-phase1c/helpers";

// ─── homeworkStatusLabel ──────────────────────────────────────────────────────

test("homeworkStatusLabel: GENERATED → 'Ready to start'", () => {
  assert.equal(homeworkStatusLabel("GENERATED"), "Ready to start");
});

test("homeworkStatusLabel: SUBMITTED → 'Awaiting marking'", () => {
  assert.equal(homeworkStatusLabel("SUBMITTED"), "Awaiting marking");
});

test("homeworkStatusLabel: COMPLETED → 'Completed'", () => {
  assert.equal(homeworkStatusLabel("COMPLETED"), "Completed");
});

test("homeworkStatusLabel: OVERDUE → 'Overdue — please complete'", () => {
  assert.equal(homeworkStatusLabel("OVERDUE"), "Overdue — please complete");
});

test("homeworkStatusLabel: unknown status → lowercased with underscores replaced", () => {
  assert.equal(homeworkStatusLabel("SOME_UNKNOWN"), "some unknown");
});

// ─── canSaveDraft ─────────────────────────────────────────────────────────────

test("canSaveDraft: STARTED and IN_PROGRESS are draftable", () => {
  assert.equal(canSaveDraft("STARTED"), true);
  assert.equal(canSaveDraft("IN_PROGRESS"), true);
});

test("canSaveDraft: OVERDUE is draftable", () => {
  assert.equal(canSaveDraft("OVERDUE"), true);
});

test("canSaveDraft: SUBMITTED and COMPLETED are not draftable", () => {
  assert.equal(canSaveDraft("SUBMITTED"), false);
  assert.equal(canSaveDraft("COMPLETED"), false);
});

// ─── computeAnsweredCount ─────────────────────────────────────────────────────

function makeQuestion(id: string, isAnswered: boolean, draftAnswer: unknown) {
  return {
    id,
    order: 1,
    subject: "Maths",
    topic: null,
    skill: null,
    questionType: "short_answer",
    prompt: `Question ${id}`,
    options: null,
    expectedAnswer: null,
    markingType: "auto",
    required: true,
    estimatedMinutes: 5,
    difficulty: 1,
    frozenAt: null,
    answer: {
      id: null,
      questionId: id,
      draftAnswer,
      submittedAnswer: null,
      isAnswered,
      answeredAt: null,
      submittedAt: null,
      markingStatus: "pending",
      isCorrect: null,
      score: null,
      reviewNeeded: false,
    },
  };
}

test("computeAnsweredCount: counts isAnswered=true questions", () => {
  const questions = [
    makeQuestion("q1", true, null),
    makeQuestion("q2", false, null),
    makeQuestion("q3", false, ""),
  ];
  assert.equal(computeAnsweredCount(questions), 1);
});

test("computeAnsweredCount: counts non-empty string drafts", () => {
  const questions = [
    makeQuestion("q1", false, "my answer"),
    makeQuestion("q2", false, "   "),   // whitespace only → not counted
    makeQuestion("q3", false, null),
  ];
  assert.equal(computeAnsweredCount(questions), 1);
});

test("computeAnsweredCount: isAnswered overrides empty draft", () => {
  const questions = [
    makeQuestion("q1", true, ""),   // answered flag wins
  ];
  assert.equal(computeAnsweredCount(questions), 1);
});

// ─── isSubmittable ────────────────────────────────────────────────────────────

function makeBatch(status: string, questions: ReturnType<typeof makeQuestion>[]) {
  return {
    id: "batch-1",
    studentId: "student-1",
    weekStart: "2026-05-26T00:00:00.000Z",
    weekEnd: "2026-06-01T23:59:59.000Z",
    timezone: "Europe/London",
    status: status as import("../src/lib/homework-phase1a/types").HomeworkLifecycleStatus,
    dueBeforeNextSession: false,
    generatedAt: "2026-05-26T00:00:00.000Z",
    startedAt: null,
    submittedAt: null,
    markedAt: null,
    completedAt: null,
    frozenAt: null,
    sourceCompletedSessionCount: 1,
    sourceStartedSessionCount: 1,
    workloadCapMinutes: 30,
    plannedMinutes: 20,
    scorePercent: null,
    recapOnly: false,
    overrideReason: null,
    excusedReason: null,
    extendedDueAt: null,
    cancelledReason: null,
    questions,
  };
}

test("isSubmittable: null batch → false", () => {
  assert.equal(isSubmittable(null, {}), false);
});

test("isSubmittable: SUBMITTED status → false (not draftable)", () => {
  const batch = makeBatch("SUBMITTED", [makeQuestion("q1", true, null)]);
  assert.equal(isSubmittable(batch, {}), false);
});

test("isSubmittable: required question unanswered → false", () => {
  const batch = makeBatch("IN_PROGRESS", [makeQuestion("q1", false, null)]);
  assert.equal(isSubmittable(batch, {}), false);
});

test("isSubmittable: required question answered via localAnswers → true", () => {
  const batch = makeBatch("IN_PROGRESS", [makeQuestion("q1", false, null)]);
  assert.equal(isSubmittable(batch, { "q1": "my answer" }), true);
});

test("isSubmittable: required question answered via saved draft → true", () => {
  const batch = makeBatch("GENERATED", [makeQuestion("q1", false, "saved draft answer")]);
  assert.equal(isSubmittable(batch, {}), true);
});

test("isSubmittable: OVERDUE batch is submittable when questions answered", () => {
  const batch = makeBatch("OVERDUE", [makeQuestion("q1", true, null)]);
  assert.equal(isSubmittable(batch, {}), true);
});

// ─── dashboard homework card helpers ─────────────────────────────────────────

test("shouldShowHomeworkDashboardCard: feature flag off hides the card", () => {
  assert.equal(shouldShowHomeworkDashboardCard({
    featureEnabled: false,
    blockNewLearningSession: true,
    hasHomework: true,
  }), false);
});

test("shouldShowHomeworkDashboardCard: shows when homework is pending", () => {
  assert.equal(shouldShowHomeworkDashboardCard({
    featureEnabled: true,
    blockNewLearningSession: true,
    hasHomework: true,
  }), true);
});

test("resolveHomeworkGateMessage: uses the child-friendly pending copy", () => {
  assert.equal(resolveHomeworkGateMessage({
    blockNewLearningSession: true,
    reason: "Weekly homework is pending. Submit homework before starting the next new learning session.",
  }), WEEKLY_HOMEWORK_PENDING_MESSAGE);
  assert.equal(WEEKLY_HOMEWORK_PENDING_MESSAGE.includes("blocked"), false);
});

test("support copy: keeps support surfaces accessible while gated", () => {
  assert.match(WEEKLY_HOMEWORK_SUPPORT_MESSAGE, /support tools/i);
  assert.match(WEEKLY_HOMEWORK_SUPPORT_MESSAGE, /Smart Catch-Up/i);
});

test("draft answers are not marked until marking data exists", () => {
  const unansweredDraft = makeQuestion("q1", false, "draft answer");
  assert.equal(unansweredDraft.answer.isCorrect, null);
  assert.equal(unansweredDraft.answer.isAnswered, false);
});

// ─── extractPromptText ────────────────────────────────────────────────────────

test("extractPromptText: plain string prompt → returned as-is", () => {
  assert.equal(extractPromptText("What is 2+2?", "fallback"), "What is 2+2?");
});

test("extractPromptText: object with text field → returns text", () => {
  assert.equal(extractPromptText({ text: "Explain photosynthesis." }, "fallback"), "Explain photosynthesis.");
});

test("extractPromptText: null prompt → fallback", () => {
  assert.equal(extractPromptText(null, "Question 1"), "Question 1");
});

test("extractPromptText: object without text → fallback", () => {
  assert.equal(extractPromptText({ html: "<p>test</p>" }, "Question 2"), "Question 2");
});
