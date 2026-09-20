import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ShortLearningTeachMoment from "../src/components/student/ShortLearningTeachMoment";
import {
  buildShortLearningTeachingMoment,
  isStructuralShortLearningBlockType,
  pickNextShortLearningBlock,
  shortLearningSessionHasStartableBlock,
  shortLearningStageHref,
} from "../src/lib/schools/short-learning-classroom";
import { extractStagePackExtras } from "../src/lib/schools/daytime-lesson-ui";

test("welcome, break, tutor support and progress report are structural classroom stages", () => {
  assert.equal(isStructuralShortLearningBlockType("welcome"), true);
  assert.equal(isStructuralShortLearningBlockType("break"), true);
  assert.equal(isStructuralShortLearningBlockType("tutor_support"), true);
  assert.equal(isStructuralShortLearningBlockType("progress_report"), true);
  assert.equal(isStructuralShortLearningBlockType("lesson"), false);
});

test("welcome stays startable when later content packs failed", () => {
  const blocks = [
    { id: "welcome", order: 0, contentId: null, status: "ready", blockType: "welcome" },
    { id: "lesson-1", order: 1, contentId: null, status: "failed", blockType: "lesson" },
    { id: "break", order: 2, contentId: null, status: "ready", blockType: "break" },
  ];
  assert.equal(shortLearningSessionHasStartableBlock(blocks), true);
  assert.equal(pickNextShortLearningBlock({ blocks, preferredOrder: 0 })?.id, "welcome");
});

test("session continues into welcome before the first lesson pack", () => {
  const next = pickNextShortLearningBlock({
    blocks: [
      { id: "welcome", order: 0, contentId: null, status: "pending", blockType: "welcome" },
      { id: "lesson-1", order: 1, contentId: "c1", status: "ready", blockType: "lesson" },
    ],
    preferredOrder: 0,
  });
  assert.equal(next?.id, "welcome");
  assert.equal(shortLearningStageHref("book-1", "welcome"), "/student/short-learning/book-1/stage/welcome");
});

test("completing welcome moves the student to the first lesson block", () => {
  const next = pickNextShortLearningBlock({
    blocks: [
      { id: "welcome", order: 0, contentId: null, status: "pending", blockType: "welcome" },
      { id: "lesson-1", order: 1, contentId: "c1", status: "ready", blockType: "lesson" },
      { id: "break", order: 2, contentId: null, status: "pending", blockType: "break" },
    ],
    preferredOrder: 1,
    completedBlockId: "welcome",
  });
  assert.equal(next?.id, "lesson-1");
});

test("teaching moment uses explanation and worked examples from the pack", () => {
  const extras = extractStagePackExtras({
    learningObjective: "Multiply using arrays",
    priorLearningWarmup: "Recall 3 times tables.",
    explanation: "An array shows equal groups in rows and columns.",
    workedExamples: [
      { question: "3 x 4", steps: ["3 rows of 4", "Count 12"], answer: "12" },
    ],
    misconceptions: ["Do not add 3 + 4."],
  });
  const teaching = buildShortLearningTeachingMoment(extras, { subject: "Maths" });
  assert.equal(teaching.hasTeaching, true);
  assert.equal(teaching.learningObjective, "Multiply using arrays");
  assert.equal(teaching.workedExamples[0]?.answer, "12");

  const html = renderToStaticMarkup(
    createElement(ShortLearningTeachMoment, {
      subjectLabel: "Maths",
      title: "Lesson block 1",
      teaching,
      onStartPractice: () => undefined,
    }),
  );
  assert.match(html, /data-testid="short-learning-teach-moment"/);
  assert.match(html, /data-testid="short-learning-start-practice"/);
  assert.match(html, /An array shows equal groups/);
  assert.match(html, /3 x 4/);
  assert.match(html, /Do not add 3 \+ 4/);
});
