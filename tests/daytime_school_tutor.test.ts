import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDaytimeSchoolTutorAccess,
  resolveQuestionFromContentJson,
  type DaytimeTutorAccessDeps,
} from "../src/lib/schools/daytime-school-tutor-access";
import {
  createMemoryDaytimeTutorHistoryStore,
  respondDaytimeSchoolTutor,
} from "../src/lib/schools/daytime-school-tutor";
import type { DaytimeSchoolTutorContext } from "../src/lib/schools/daytime-school-tutor-access";

const CONTENT_JSON = JSON.stringify({
  subjectType: "reading",
  title: "River fox",
  passage: { text: "The fox ran by the river. It paused near the reeds." },
  questions: [
    {
      id: "q1",
      question: "Where did the fox pause?",
      answer: "near the reeds",
      explanation: "The passage says it paused near the reeds.",
      hints: ["Look at the last sentence.", "Find the word reeds."],
      breakdown: {
        simplerQuestion: "Which place near the water is named in the last sentence?",
        steps: ["Read the last sentence again.", "Find the place word."],
        keyWords: [{ word: "reeds", meaning: "tall plants that grow by water" }],
        startingPoint: "Start with the last sentence.",
      },
    },
    {
      id: "q2",
      question: "What ran by the river?",
      answer: "the fox",
      hints: ["Look at the first sentence."],
      explanation: "The fox ran by the river.",
    },
  ],
});

function baseDeps(overrides: Partial<DaytimeTutorAccessDeps> = {}): DaytimeTutorAccessDeps {
  return {
    findActiveEnrolment: async () => ({
      id: "enrol-1",
      schoolId: "school-1",
      classroomId: "class-1",
    }),
    findPeriod: async () => ({
      id: "period-1",
      schoolId: "school-1",
      classroomId: "class-1",
      subject: "English",
      title: "Guided Reading",
      lessonType: "core",
      yearGroup: "Year 6",
      skillFocus: "Inference",
      startsAt: "09:00",
      endsAt: "09:50",
      lessonId: "lesson-1",
      lesson: {
        id: "lesson-1",
        contentRefs: "content-1,content-2,content-3",
        yearGroup: "Year 6",
        skillFocus: "Inference",
        reviewStatus: "approved",
      },
    }),
    findAssignment: async () => ({
      id: "asg-1",
      status: "assigned",
      contentId: "content-1",
      content: {
        id: "content-1",
        contentType: "reading",
        contentJson: CONTENT_JSON,
        metadataJson: JSON.stringify({
          daytimeSession: { stage: "warmup", stageIndex: 0 },
        }),
        skillFocus: "Inference",
        yearGroup: "Year 6",
        topic: "Guided Reading",
      },
    }),
    now: () => new Date("2026-07-24T08:15:00.000Z"), // 09:15 local if UTC+1 — use fixed minutes via clock
    ...overrides,
  };
}

// Force "now" inside 09:00–09:50 by constructing a date whose local hours match.
function atLocalHm(hours: number, minutes: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

test("resolveQuestionFromContentJson finds question by id and index", () => {
  const byId = resolveQuestionFromContentJson(CONTENT_JSON, { questionId: "q2" });
  assert.equal(byId?.id, "q2");
  assert.match(byId?.prompt ?? "", /river/i);

  const byIndex = resolveQuestionFromContentJson(CONTENT_JSON, { questionIndex: 0 });
  assert.equal(byIndex?.id, "q1");
  assert.equal(byIndex?.storedHelp.breakdown?.keyWords?.[0]?.word, "reeds");
});

test("assertDaytimeSchoolTutorAccess succeeds for valid daytime student", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "content-1",
      questionId: "q1",
    },
    baseDeps({ now: () => atLocalHm(9, 15) }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.context.schoolId, "school-1");
  assert.equal(result.context.stage, "warmup");
  assert.equal(result.context.question.id, "q1");
  assert.equal(result.context.sharedPassage?.includes("fox"), true);
});

test("gate rejects inactive enrolment", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "content-1",
    },
    baseDeps({
      findActiveEnrolment: async () => null,
      now: () => atLocalHm(9, 15),
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "INACTIVE_ENROLMENT");
  assert.equal(result.status, 403);
});

test("gate rejects unapproved lesson", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "content-1",
    },
    baseDeps({
      now: () => atLocalHm(9, 15),
      findPeriod: async () => ({
        id: "period-1",
        schoolId: "school-1",
        classroomId: "class-1",
        subject: "English",
        title: "Guided Reading",
        lessonType: "core",
        yearGroup: "Year 6",
        skillFocus: "Inference",
        startsAt: "09:00",
        endsAt: "09:50",
        lessonId: "lesson-1",
        lesson: {
          id: "lesson-1",
          contentRefs: "content-1",
          yearGroup: "Year 6",
          skillFocus: "Inference",
          reviewStatus: "awaiting_review",
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "LESSON_NOT_APPROVED");
});

test("gate rejects content not linked to daytime lesson (homework/practice)", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "homework-content",
    },
    baseDeps({ now: () => atLocalHm(9, 15) }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "NOT_DAYTIME_CONTENT");
});

test("gate rejects another student's assignment", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-other",
      contentId: "content-1",
    },
    baseDeps({
      now: () => atLocalHm(9, 15),
      findAssignment: async () => null,
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "ASSIGNMENT_MISMATCH");
});

test("gate rejects wrong question id", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "content-1",
      questionId: "missing-q",
      questionIndex: 99,
    },
    baseDeps({ now: () => atLocalHm(9, 15) }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "QUESTION_NOT_FOUND");
});

test("gate rejects ended period", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "content-1",
    },
    baseDeps({ now: () => atLocalHm(10, 5) }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "PERIOD_ENDED");
});

test("gate rejects classroom mismatch", async () => {
  const result = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "content-1",
    },
    baseDeps({
      now: () => atLocalHm(9, 15),
      findPeriod: async () => ({
        id: "period-1",
        schoolId: "school-1",
        classroomId: "other-class",
        subject: "English",
        title: "Guided Reading",
        lessonType: "core",
        yearGroup: "Year 6",
        skillFocus: "Inference",
        startsAt: "09:00",
        endsAt: "09:50",
        lessonId: "lesson-1",
        lesson: {
          id: "lesson-1",
          contentRefs: "content-1",
          yearGroup: "Year 6",
          skillFocus: "Inference",
          reviewStatus: "approved",
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "CLASSROOM_MISMATCH");
});

function sampleContext(overrides: Partial<DaytimeSchoolTutorContext> = {}): DaytimeSchoolTutorContext {
  const question = resolveQuestionFromContentJson(CONTENT_JSON, { questionId: "q1" })!;
  return {
    studentId: "child-1",
    schoolId: "school-1",
    classroomId: "class-1",
    lessonId: "lesson-1",
    periodId: "period-1",
    assignmentId: "asg-1",
    contentId: "content-1",
    stage: "warmup",
    stageOrder: 0,
    subject: "English",
    yearGroup: "Year 6",
    lessonTitle: "Guided Reading",
    curriculumSkill: "Inference",
    periodEndsAt: "09:50",
    periodStartsAt: "09:00",
    periodActive: true,
    assignmentStatus: "assigned",
    question,
    storedHelp: question.storedHelp,
    contentType: "reading",
    sharedPassage: "The fox ran by the river. It paused near the reeds.",
    ruleExplanation: null,
    ...overrides,
  };
}

test("stored-help-first: first response uses stored help and does not reveal answer", async () => {
  const calls: unknown[] = [];
  const response = await respondDaytimeSchoolTutor({
    context: sampleContext(),
    intent: "explain-question",
    history: createMemoryDaytimeTutorHistoryStore(),
    openAi: async (input) => {
      calls.push(input);
      return null;
    },
  });
  assert.equal(response.source, "stored-help");
  assert.equal(response.revealsAnswer, false);
  assert.equal(calls.length, 0);
  assert.match(response.message.toLowerCase(), /last sentence|reeds|start/);
  assert.ok(!response.message.toLowerCase().includes("paused near the reeds") || response.message.includes("Start"));
});

test("stored-help-first: explain-word uses contextual definition", async () => {
  const response = await respondDaytimeSchoolTutor({
    context: sampleContext(),
    intent: "explain-word",
    word: "reeds",
    history: createMemoryDaytimeTutorHistoryStore(),
    openAi: async () => null,
  });
  assert.equal(response.source, "stored-help");
  assert.match(response.message.toLowerCase(), /reeds/);
  assert.match(response.message.toLowerCase(), /water|plants/);
  assert.equal(response.revealsAnswer, false);
});

test("stored-help-first: why-wrong uses attempt without revealing answer", async () => {
  const response = await respondDaytimeSchoolTutor({
    context: sampleContext({ studentAttempt: "by the bridge" }),
    intent: "why-wrong",
    history: createMemoryDaytimeTutorHistoryStore(),
    openAi: async () => null,
  });
  assert.equal(response.source, "stored-help");
  assert.match(response.message, /by the bridge/);
  assert.equal(response.revealsAnswer, false);
  assert.ok(!response.message.toLowerCase().includes("near the reeds") || response.message.includes("useful try"));
});

test("stored-help-first: show-first-step returns starting point only", async () => {
  const response = await respondDaytimeSchoolTutor({
    context: sampleContext(),
    intent: "show-first-step",
    history: createMemoryDaytimeTutorHistoryStore(),
    openAi: async () => null,
  });
  assert.equal(response.source, "stored-help");
  assert.match(response.message.toLowerCase(), /start/);
  assert.equal(response.revealsAnswer, false);
});

test("OpenAI used only when stored help cannot satisfy intent", async () => {
  let called = 0;
  const response = await respondDaytimeSchoolTutor({
    context: sampleContext(),
    intent: "explain-word",
    word: "xylophone-not-in-passage",
    history: createMemoryDaytimeTutorHistoryStore(),
    openAi: async () => {
      called += 1;
      return {
        message: "That word is not a key word in this passage — check the question again.",
        hintLevel: 1,
        revealsAnswer: false,
        needsTeacher: false,
        misconception: "Guessing key words that are not in the passage",
      };
    },
  });
  assert.equal(called, 1);
  assert.equal(response.source, "openai");
  assert.equal(response.revealsAnswer, false);
  assert.equal(response.misconception, "Guessing key words that are not in the passage");
});

test("invalid OpenAI structure falls back safely with needsTeacher", async () => {
  const response = await respondDaytimeSchoolTutor({
    context: sampleContext(),
    intent: "explain-word",
    word: "zzzz-unknown-word",
    history: createMemoryDaytimeTutorHistoryStore(),
    openAi: async () => null,
  });
  assert.equal(response.source, "fallback");
  assert.equal(response.needsTeacher, true);
  assert.match(response.message, /ask your teacher/i);
  assert.equal(response.revealsAnswer, false);
});

test("repeated give-hint advances through stored help steps", async () => {
  const history = createMemoryDaytimeTutorHistoryStore();
  const context = sampleContext();

  const first = await respondDaytimeSchoolTutor({
    context,
    intent: "give-hint",
    history,
    openAi: async () => null,
  });

  const second = await respondDaytimeSchoolTutor({
    context,
    intent: "give-hint",
    conversationId: first.conversationId,
    history,
    openAi: async () => null,
  });

  assert.equal(first.source, "stored-help");
  assert.equal(second.source, "stored-help");
  assert.notEqual(first.message, second.message);
  assert.ok(second.hintLevel >= first.hintLevel);
});

test("client-supplied answer cannot override stored model answer in context", async () => {
  const access = await assertDaytimeSchoolTutorAccess(
    {
      studentId: "child-1",
      periodId: "period-1",
      assignmentId: "asg-1",
      contentId: "content-1",
      questionId: "q1",
      studentAttempt: "forged attempt",
    },
    baseDeps({
      now: () => atLocalHm(9, 15),
      findAssignment: async () => ({
        id: "asg-1",
        status: "assigned",
        contentId: "content-1",
        content: {
          id: "content-1",
          contentType: "reading",
          contentJson: CONTENT_JSON,
          metadataJson: JSON.stringify({ daytimeSession: { stage: "core", stageIndex: 1 } }),
          skillFocus: "Inference",
          yearGroup: "Year 6",
          topic: "Guided Reading",
        },
      }),
    }),
  );
  assert.equal(access.ok, true);
  if (!access.ok) return;
  assert.equal(access.context.question.modelAnswer, "near the reeds");
  assert.equal(access.context.studentAttempt, "forged attempt");
});
