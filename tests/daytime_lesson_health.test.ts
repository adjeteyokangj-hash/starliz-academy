import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDaytimeLessonHealth } from "../src/lib/schools/daytime-lesson-health";
import { buildDaytimeContentPack } from "../src/lib/schools/generate-daytime-lesson-content";

function guidedReadingStageJson(input: {
  title: string;
  minutes: number;
  questionCount: number;
}): string {
  const passageText = Array.from({ length: 55 }, (_, i) => `word${i}`).join(" ");
  const questions = Array.from({ length: input.questionCount }, (_, index) => ({
    prompt: `According to the passage, what detail supports idea ${index + 1}?`,
    answer: `Detail ${index + 1}`,
    explanation: "Use evidence from the passage.",
    hints: ["Find the matching sentence", "Underline the clue"],
    breakdown: {
      simplerQuestion: `What does the passage say about idea ${index + 1}?`,
      steps: ["Read the passage", "Find the clue"],
      keyWords: [{ word: "evidence", meaning: "proof from the text" }],
      startingPoint: "Start with the first paragraph.",
    },
  }));
  return JSON.stringify({
    subjectType: "guided-reading",
    title: input.title,
    estimatedMinutes: input.minutes,
    targetItems: input.questionCount,
    passage: {
      title: "The Quiet Harbour",
      text: passageText,
      paragraphs: [passageText],
      wordCount: 55,
    },
    vocabulary: [{ word: "harbour", childFriendlyMeaning: "a safe place for boats" }],
    activities: [
      { kind: "read-passage", estimatedMinutes: Math.max(2, Math.round(input.minutes * 0.3)) },
      { kind: "vocabulary", estimatedMinutes: Math.max(1, Math.round(input.minutes * 0.2)) },
      { kind: "multiple-choice", estimatedMinutes: Math.max(2, Math.round(input.minutes * 0.35)) },
      { kind: "reasoning", estimatedMinutes: Math.max(1, Math.round(input.minutes * 0.15)) },
    ],
    questions,
  });
}

test("evaluateDaytimeLessonHealth passes a complete three-stage period", () => {
  const health = evaluateDaytimeLessonHealth({
    startsAt: "09:00",
    endsAt: "09:50",
    subject: "English — Guided reading",
    skillFocus: "Inference",
    stages: [
      {
        id: "1",
        contentType: "reading",
        skillFocus: "Inference",
        contentJson: guidedReadingStageJson({ title: "Warm-up", minutes: 8, questionCount: 4 }),
        metadataJson: JSON.stringify({ daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8 } }),
        blackBoxPassed: true,
      },
      {
        id: "2",
        contentType: "reading",
        skillFocus: "Inference",
        contentJson: guidedReadingStageJson({ title: "Core", minutes: 22, questionCount: 8 }),
        metadataJson: JSON.stringify({ daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 22 } }),
        blackBoxPassed: true,
      },
      {
        id: "3",
        contentType: "reading",
        skillFocus: "Inference",
        contentJson: guidedReadingStageJson({ title: "Stretch", minutes: 10, questionCount: 4 }),
        metadataJson: JSON.stringify({ daytimeSession: { stage: "stretch", stageIndex: 2, estimatedMinutes: 10 } }),
        blackBoxPassed: true,
      },
    ],
  });
  assert.equal(health.overall, "PASS", health.reason ?? "expected pass");
  assert.ok(health.checks.every((check) => check.passed));
});

test("evaluateDaytimeLessonHealth fails when pupil text leaks internal IDs", () => {
  const items = JSON.stringify([
    { prompt: "Q1", answer: "1", question: "According to the passage, what should you do in the core-cmrxh6v9y00gzskmshbrosom6 stage?" },
    { prompt: "Q2", answer: "2" },
    { prompt: "Q3", answer: "3" },
  ]);
  const health = evaluateDaytimeLessonHealth({
    startsAt: "09:00",
    endsAt: "09:50",
    subject: "English",
    skillFocus: "Inference",
    stages: [
      {
        id: "1",
        contentType: "reading",
        skillFocus: "Inference",
        contentJson: items,
        metadataJson: JSON.stringify({ daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8 } }),
        blackBoxPassed: true,
      },
      {
        id: "2",
        contentType: "reading",
        skillFocus: "Inference",
        contentJson: items,
        metadataJson: JSON.stringify({ daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 22 } }),
        blackBoxPassed: true,
      },
    ],
  });
  assert.equal(health.overall, "FAIL");
  assert.ok(health.checks.some((check) => check.id === "clarity" && !check.passed));
});

test("evaluateDaytimeLessonHealth fails when a stage fails machine checks", () => {
  const items = JSON.stringify([
    { prompt: "Q1", answer: "1" },
    { prompt: "Q2", answer: "2" },
    { prompt: "Q3", answer: "3" },
  ]);
  const health = evaluateDaytimeLessonHealth({
    startsAt: "09:00",
    endsAt: "09:50",
    subject: "Maths",
    skillFocus: "Fractions",
    stages: [
      {
        id: "1",
        contentType: "math",
        skillFocus: "Fractions",
        contentJson: items,
        metadataJson: JSON.stringify({ daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8 } }),
        blackBoxPassed: true,
      },
      {
        id: "2",
        contentType: "math",
        skillFocus: "Fractions",
        contentJson: items,
        metadataJson: JSON.stringify({ daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 22 } }),
        blackBoxPassed: false,
      },
    ],
  });
  assert.equal(health.overall, "FAIL");
  assert.ok(health.reason);
});

test("buildDaytimeContentPack does not put period IDs in pupil questions", () => {
  const pack = buildDaytimeContentPack({
    title: "English — Guided reading · Core practice",
    subject: "English",
    skillFocus: "Reading inference",
    yearGroup: "Year 4",
    itemCount: 6,
    stageSeed: "core-cmrxh6v9y00gzskmshbrosom6",
    stageLabel: "Core practice",
    lessonTitle: "English — Guided reading",
  });
  assert.equal(pack.contentJson.includes("cmrxh6v9y00gzskmshbrosom6"), false);
  assert.equal(pack.contentJson.includes("core-cmrx"), false);
  assert.match(pack.contentJson, /Core practice|core practice/i);
});
