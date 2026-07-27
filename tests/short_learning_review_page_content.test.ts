import test from "node:test";
import assert from "node:assert/strict";
import { parsePlayableLessonContent } from "../src/lib/schools/parse-playable-lesson-content";

/**
 * Regression: journey review previously assumed array contentJson and showed nothing
 * for Daytime object packs. This documents the supported shapes for Admin review.
 */
test("supported maths object pack keys are reviewable", () => {
  const pack = {
    subjectType: "maths",
    title: "Lesson",
    estimatedMinutes: 15,
    targetItems: 1,
    activities: [{ kind: "scaffold", estimatedMinutes: 5 }],
    learningObjective: "LO",
    explanation: "Explain",
    workedExamples: [{ question: "2x3", steps: ["2+2+2"], answer: "6" }],
    generationStatus: "ok",
    failureReason: null,
    questions: [{ prompt: "2x4?", question: "2x4?", answer: "8", explanation: "ok", hints: ["hint"] }],
    items: [{ prompt: "2x4?", question: "2x4?", answer: "8", explanation: "ok", hints: ["hint"] }],
  };
  const parsed = parsePlayableLessonContent(JSON.stringify(pack), { contentType: "math" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.workedExamples.length, 1);
});

test("supported reading object pack keys are reviewable", () => {
  const pack = {
    subjectType: "guided-reading",
    title: "Reading",
    estimatedMinutes: 15,
    targetItems: 1,
    activities: [{ kind: "read-passage", estimatedMinutes: 5 }],
    passage: { title: "T", text: "Once upon a time there was a careful reader.", paragraphs: ["Once upon a time there was a careful reader."], wordCount: 9 },
    vocabulary: [{ word: "careful", childFriendlyMeaning: "taking care" }],
    generationStatus: "ok",
    questions: [{ prompt: "Who?", question: "Who?", answer: "a reader", explanation: "text", hints: [] }],
    items: [],
  };
  const parsed = parsePlayableLessonContent(JSON.stringify(pack), { contentType: "reading" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.ok(parsed.passage?.text);
  assert.equal(parsed.vocabulary.length, 1);
});
