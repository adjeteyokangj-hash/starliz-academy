import test from "node:test";
import assert from "node:assert/strict";

import { createGeneratedBatchState, markHomework, saveDraftAnswer, submitHomework } from "../src/lib/homework-phase1a/stateTransitions";
import { evaluateHomeworkSessionGate } from "../src/lib/homework-phase1a/gate";
import {
  markHomeworkSubmission,
  unavailableHomeworkOpenAnswerAiBoundary,
  type HomeworkOpenAnswerAiBoundary,
} from "../src/lib/homework-phase1d/marking";

const NOW = new Date("2026-05-31T10:00:00.000Z");

test("marking happens only after submit", async () => {
  const result = await markHomeworkSubmission({
    questions: [{
      id: "q1",
      subject: "Maths",
      topic: "Fractions",
      skill: "Equivalent fractions",
      questionType: "multiple_choice",
      prompt: "Which fraction equals one half?",
      expectedAnswer: "2/4",
      submittedAnswer: "2/4",
    }],
  });

  const draft = saveDraftAnswer(createGeneratedBatchState(["q1"]), "q1", NOW);
  assert.equal(draft.marked, false);
  assert.equal(draft.state.status, "IN_PROGRESS");
  assert.equal(result.summary.scorePercent, 100);
});

test("draft answer save does not mark", () => {
  const draft = saveDraftAnswer(createGeneratedBatchState(["q1"]), "q1", NOW);

  assert.equal(draft.marked, false);
  assert.equal(draft.state.scorePercent, null);
  assert.equal(draft.state.markedAtIso, null);
});

test("auto-marking calculates score for exact and numeric answers", async () => {
  const marked = await markHomeworkSubmission({
    questions: [
      {
        id: "q1",
        subject: "Maths",
        topic: "Number",
        skill: "Addition",
        questionType: "simple_numeric",
        prompt: "What is 7 + 5?",
        expectedAnswer: 12,
        submittedAnswer: "12",
      },
      {
        id: "q2",
        subject: "English",
        topic: "Spelling",
        skill: "Common exception words",
        questionType: "spelling",
        prompt: "Spell because.",
        expectedAnswer: "because",
        submittedAnswer: "becuase",
      },
    ],
  });

  assert.equal(marked.summary.scorePercent, 50);
  assert.equal(marked.summary.correctCount, 1);
  assert.equal(marked.summary.incorrectCount, 1);
});

test("open answer without AI becomes REVIEW_NEEDED", async () => {
  const marked = await markHomeworkSubmission({
    questions: [{
      id: "q1",
      subject: "Science",
      topic: "Plants",
      skill: "Explanation",
      questionType: "open_answer",
      prompt: "Explain photosynthesis.",
      expectedAnswer: null,
      submittedAnswer: "Plants use sunlight to make food.",
    }],
    aiBoundary: unavailableHomeworkOpenAnswerAiBoundary,
  });

  assert.equal(marked.answers[0]?.markingStatus, "review_needed");
  assert.equal(marked.summary.outcomeBand, "REVIEW_NEEDED");
  assert.equal(marked.summary.reviewNeededCount, 1);
});

test("outcome band calculated correctly", async () => {
  const mastered = await markHomeworkSubmission({
    questions: [
      {
        id: "q1",
        subject: "Maths",
        topic: "Fractions",
        skill: "Equivalent fractions",
        questionType: "multiple_choice",
        prompt: "Which is equal to one half?",
        expectedAnswer: "2/4",
        submittedAnswer: "2/4",
      },
      {
        id: "q2",
        subject: "Maths",
        topic: "Fractions",
        skill: "Equivalent fractions",
        questionType: "true_false",
        prompt: "One half equals three quarters.",
        expectedAnswer: false,
        submittedAnswer: false,
      },
    ],
  });

  const needsSupport = await markHomeworkSubmission({
    questions: [
      {
        id: "q1",
        subject: "English",
        topic: "Spelling",
        skill: "Common exception words",
        questionType: "spelling",
        prompt: "Spell friend.",
        expectedAnswer: "friend",
        submittedAnswer: "freind",
      },
      {
        id: "q2",
        subject: "English",
        topic: "Spelling",
        skill: "Common exception words",
        questionType: "spelling",
        prompt: "Spell school.",
        expectedAnswer: "school",
        submittedAnswer: "skool",
      },
    ],
  });

  assert.equal(mastered.summary.outcomeBand, "MASTERED");
  assert.equal(needsSupport.summary.outcomeBand, "NEEDS_SUPPORT");
});

test("under-50 creates recap-only path", () => {
  const initial = createGeneratedBatchState(["q1"]);
  const draft = saveDraftAnswer(initial, "q1", NOW);
  const submit = submitHomework(draft.state, NOW);
  assert.equal(submit.ok, true);
  if (!submit.ok) return;

  const marked = markHomework(submit.state, NOW, 45, false);

  assert.equal(marked.state.recapOnly, true);
  assert.equal(marked.state.status, "COMPLETED");
});

test("submitted official attempt cannot be changed", () => {
  const initial = createGeneratedBatchState(["q1"]);
  const draft = saveDraftAnswer(initial, "q1", NOW);
  const submit = submitHomework(draft.state, NOW);
  assert.equal(submit.ok, true);
  if (!submit.ok) return;

  const resaved = saveDraftAnswer(submit.state, "q1", new Date(NOW.getTime() + 1000));

  assert.equal(resaved.state.status, "SUBMITTED");
  assert.equal(resaved.state.submittedAtIso, submit.state.submittedAtIso);
  assert.equal(resaved.marked, false);
});

test("marking updates gate state correctly", () => {
  const initial = createGeneratedBatchState(["q1"]);
  const draft = saveDraftAnswer(initial, "q1", NOW);
  const submit = submitHomework(draft.state, NOW);
  assert.equal(submit.ok, true);
  if (!submit.ok) return;

  const lowScore = markHomework(submit.state, NOW, 40, false);
  const reviewNeeded = markHomework(submit.state, NOW, null, true);
  const lowScoreGate = evaluateHomeworkSessionGate(lowScore.state);
  const reviewGate = evaluateHomeworkSessionGate(reviewNeeded.state);

  assert.equal(lowScoreGate.blockNewLearningSession, true);
  assert.equal(lowScoreGate.allowRecapCatchUpOnly, true);
  assert.equal(reviewGate.blockNewLearningSession, true);
  assert.equal(reviewGate.allowRecapCatchUpOnly, false);
});

test("AI boundary can safely return a reviewed open-answer result", async () => {
  const boundary: HomeworkOpenAnswerAiBoundary = {
    async markOpenAnswer() {
      return {
        available: true,
        markingStatus: "correct",
        isCorrect: true,
        score: 100,
        feedback: "Strong explanation.",
        aiConfidence: 91,
      };
    },
  };

  const marked = await markHomeworkSubmission({
    questions: [{
      id: "q1",
      subject: "Science",
      topic: "Plants",
      skill: "Explanation",
      questionType: "open_answer",
      prompt: "Explain photosynthesis.",
      expectedAnswer: null,
      submittedAnswer: "Plants use sunlight to make food.",
    }],
    aiBoundary: boundary,
  });

  assert.equal(marked.summary.outcomeBand, "MASTERED");
  assert.equal(marked.answers[0]?.aiConfidence, 91);
});