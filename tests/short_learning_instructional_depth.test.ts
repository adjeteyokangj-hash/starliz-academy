import test from "node:test";
import assert from "node:assert/strict";
import { validateDaytimeStagePack, normalizeDaytimeStagePack } from "../src/lib/schools/daytime-stage-validators";
import {
  classifyShortLearningBlockIntent,
  instructionalDepthBudget,
  validateShortLearningInstructionalDepth,
} from "../src/lib/schools/short-learning-instructional-depth";
import { isShortLearningAdminDuration } from "../src/lib/schools/short-learning-session-plan";

function richMathsLessonPack(overrides: Record<string, unknown> = {}) {
  return normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Lesson block 1 · New concept",
    estimatedMinutes: 18,
    targetItems: 6,
    learningObjective: "Multiply a two-digit number by 4 using partitioning.",
    priorLearningWarmup: "Recall 4 times table facts up to 12 × 4.",
    explanation:
      "When we multiply a two-digit number by 4, we can partition into tens and ones, multiply each part by 4, then recombine. This keeps place value clear and reduces mistakes.",
    workedExamples: [
      { question: "23 × 4", steps: ["20 × 4 = 80", "3 × 4 = 12", "80 + 12 = 92"], answer: "92" },
      { question: "45 × 4", steps: ["40 × 4 = 160", "5 × 4 = 20", "160 + 20 = 180"], answer: "180" },
    ],
    activities: [
      { kind: "fluency", estimatedMinutes: 2, title: "Prior recall" },
      { kind: "teacher-explanation", estimatedMinutes: 4 },
      { kind: "worked-example", estimatedMinutes: 3 },
      { kind: "scaffold", estimatedMinutes: 4 },
      { kind: "independent", estimatedMinutes: 3 },
      { kind: "reasoning", estimatedMinutes: 1 },
      { kind: "reflection", estimatedMinutes: 1 },
    ],
    misconceptions: ["Forgetting to multiply the tens", "Adding instead of multiplying the ones"],
    reflectionCheck: "How confident are you at partitioning before multiplying?",
    transitionNote: "Next we will practise guided examples with slightly larger numbers.",
    questions: [
      { prompt: "Warm-up: what is 7 × 4?", answer: "28", explanation: "7 groups of 4.", hints: ["Count in fours", "Use known facts"] },
      { prompt: "Complete: 32 × 4 = (30 × 4) + (? × 4)", answer: "2", explanation: "Partition ones.", hints: ["Look at ones", "2 ones"], kind: "scaffold" },
      { prompt: "Calculate 26 × 4", answer: "104", explanation: "20×4=80, 6×4=24, total 104.", hints: ["Partition", "Recombine"] },
      { prompt: "Calculate 38 × 4", answer: "152", explanation: "30×4=120, 8×4=32.", hints: ["Tens first", "Check addition"] },
      { prompt: "Explain why 25 × 4 is not 29.", answer: "Because multiplying is repeated addition of 25 four times, not adding 4.", explanation: "Addresses adding error.", hints: ["Think repeated addition", "Place value"], kind: "reasoning" },
      { prompt: "What have you learned about partitioning?", answer: "Split tens and ones, multiply, then recombine.", explanation: "Reflection.", hints: ["Name the steps"], kind: "reflection" },
    ],
    generationStatus: "ok",
    ...overrides,
  }, "maths")!;
}

test("duration budget sums to target minutes", () => {
  for (const minutes of [14, 18, 20]) {
    const budget = instructionalDepthBudget(minutes);
    const sum =
      budget.priorLearningMinutes +
      budget.teachingMinutes +
      budget.workedExampleMinutes +
      budget.guidedMinutes +
      budget.independentMinutes +
      budget.reflectionMinutes;
    assert.equal(sum, minutes);
  }
});

test("block intent classification", () => {
  assert.equal(classifyShortLearningBlockIntent("Quick recap"), "recap");
  assert.equal(classifyShortLearningBlockIntent("Challenge tasks"), "challenge");
  assert.equal(classifyShortLearningBlockIntent("Final review"), "final_review");
  assert.equal(classifyShortLearningBlockIntent("Lesson block 1 · New concept"), "lesson");
});

test("thin maths lesson is rejected by Short Learning depth validator", () => {
  const thin = normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Lesson block 1 · New concept",
    estimatedMinutes: 18,
    targetItems: 5,
    explanation: "Multiply by 4.",
    workedExamples: [{ question: "2×4", steps: ["8"], answer: "8" }],
    activities: [
      { kind: "teacher-explanation", estimatedMinutes: 5 },
      { kind: "independent", estimatedMinutes: 13 },
    ],
    questions: [
      { prompt: "3×4?", answer: "12", explanation: "ok", hints: ["a", "b"] },
      { prompt: "4×4?", answer: "16", explanation: "ok", hints: ["a", "b"] },
      { prompt: "5×4?", answer: "20", explanation: "ok", hints: ["a", "b"] },
      { prompt: "6×4?", answer: "24", explanation: "ok", hints: ["a", "b"] },
      { prompt: "7×4?", answer: "28", explanation: "ok", hints: ["a", "b"] },
    ],
    generationStatus: "ok",
  }, "maths")!;

  const issues = validateShortLearningInstructionalDepth({
    pack: thin,
    mode: "maths",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
  });
  const codes = issues.map((i) => i.code);
  assert.ok(codes.includes("sl_thin_teaching") || codes.includes("sl_missing_worked_examples"));
  assert.ok(codes.some((c) => c.startsWith("sl_")));
});

test("rich maths lesson passes Short Learning depth validator", () => {
  const pack = richMathsLessonPack();
  const issues = validateShortLearningInstructionalDepth({
    pack,
    mode: "maths",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
  });
  assert.deepEqual(issues, []);
});

test("Day School profile does not apply Short Learning depth codes", () => {
  const thin = normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Core",
    estimatedMinutes: 15,
    targetItems: 3,
    explanation: "Short.",
    workedExamples: [{ question: "2×3", steps: ["6"], answer: "6" }],
    activities: [
      { kind: "teacher-explanation", estimatedMinutes: 5 },
      { kind: "scaffold", estimatedMinutes: 5 },
      { kind: "independent", estimatedMinutes: 5 },
      { kind: "reasoning", estimatedMinutes: 1 },
    ],
    questions: [
      { prompt: "Explain why 2×3=6", answer: "two groups of three", explanation: "ok", hints: ["a", "b"], kind: "reasoning" },
      { prompt: "4×3?", answer: "12", explanation: "ok", hints: ["a", "b"] },
      { prompt: "5×3?", answer: "15", explanation: "ok", hints: ["a", "b"] },
    ],
    generationStatus: "ok",
  }, "maths")!;

  const daySchool = validateDaytimeStagePack({
    pack: thin,
    mode: "maths",
    stage: "core",
    targetMinutes: 15,
    lessonTitle: "Day School",
  });
  assert.equal(daySchool.some((i) => i.code.startsWith("sl_")), false);

  const shortLearning = validateDaytimeStagePack({
    pack: thin,
    mode: "maths",
    stage: "core",
    targetMinutes: 18,
    lessonTitle: "SL",
    instructionalDepthProfile: "short-learning",
    stageLabel: "Lesson block 1 · New concept",
  });
  assert.ok(shortLearning.some((i) => i.code.startsWith("sl_")));
});

test("recap requires method reminder and misconception without new topic padding rules", () => {
  const thinRecap = normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Quick recap",
    estimatedMinutes: 5,
    targetItems: 1,
    explanation: "Recall.",
    activities: [{ kind: "short-answer", estimatedMinutes: 5 }],
    questions: [{ prompt: "1×4?", answer: "4", explanation: "ok", hints: ["a", "b"] }],
    generationStatus: "ok",
  }, "maths")!;
  const issues = validateShortLearningInstructionalDepth({
    pack: thinRecap,
    mode: "maths",
    stage: "warmup",
    stageLabel: "Quick recap",
    targetMinutes: 5,
  });
  assert.ok(issues.some((i) => i.code.startsWith("sl_recap_")));
});

test("challenge rejects number-substitution-only packs", () => {
  const thinChallenge = normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Challenge tasks",
    estimatedMinutes: 10,
    targetItems: 3,
    explanation: "Harder.",
    activities: [
      { kind: "independent", estimatedMinutes: 5 },
      { kind: "short-answer", estimatedMinutes: 5 },
    ],
    questions: [
      { prompt: "48 × 4?", answer: "192", explanation: "ok", hints: ["a", "b"] },
      { prompt: "56 × 4?", answer: "224", explanation: "ok", hints: ["a", "b"] },
      { prompt: "64 × 4?", answer: "256", explanation: "ok", hints: ["a", "b"] },
    ],
    generationStatus: "ok",
  }, "maths")!;
  const issues = validateShortLearningInstructionalDepth({
    pack: thinChallenge,
    mode: "maths",
    stage: "stretch",
    stageLabel: "Challenge tasks",
    targetMinutes: 10,
  });
  assert.ok(issues.some((i) => i.code.startsWith("sl_challenge_")));
});

test("final review requires summary reflection and next step", () => {
  const thinReview = normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Final review",
    estimatedMinutes: 5,
    targetItems: 2,
    explanation: "Done.",
    activities: [{ kind: "short-answer", estimatedMinutes: 5 }],
    questions: [
      { prompt: "2×4?", answer: "8", explanation: "ok", hints: ["a", "b"] },
      { prompt: "3×4?", answer: "12", explanation: "ok", hints: ["a", "b"] },
    ],
    generationStatus: "ok",
  }, "maths")!;
  const issues = validateShortLearningInstructionalDepth({
    pack: thinReview,
    mode: "maths",
    stage: "stretch",
    stageLabel: "Final review",
    targetMinutes: 5,
  });
  assert.ok(issues.some((i) => i.code.startsWith("sl_review_")));
});

test("English reading thin passage rejected for Short Learning lesson depth", () => {
  const pack = normalizeDaytimeStagePack({
    subjectType: "guided-reading",
    title: "Lesson block 1 · New concept",
    estimatedMinutes: 18,
    targetItems: 4,
    learningObjective: "Retrieve key details",
    priorLearningWarmup: "Discuss title predictions.",
    explanation: "Model how to find evidence in the text by underlining key phrases and checking the question stem carefully before answering.",
    passage: { title: "Short", text: "Too short.", paragraphs: ["Too short."], wordCount: 2 },
    vocabulary: [
      { word: "a", childFriendlyMeaning: "one" },
      { word: "b", childFriendlyMeaning: "two" },
      { word: "c", childFriendlyMeaning: "three" },
    ],
    misconceptions: ["Guessing without evidence"],
    reflectionCheck: "What strategy helped most?",
    transitionNote: "Next we infer character motives.",
    activities: [
      { kind: "prediction", estimatedMinutes: 2 },
      { kind: "read-passage", estimatedMinutes: 5 },
      { kind: "teacher-explanation", estimatedMinutes: 3 },
      { kind: "scaffold", estimatedMinutes: 3 },
      { kind: "short-answer", estimatedMinutes: 3 },
      { kind: "reasoning", estimatedMinutes: 1 },
      { kind: "reflection", estimatedMinutes: 1 },
    ],
    workedExamples: [{ question: "Where is the market?", steps: ["Scan first sentence"], answer: "In the village" }],
    questions: [
      { prompt: "Warm-up prediction?", answer: "open", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Retrieve: where?", answer: "village", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Infer: how does Amira feel?", answer: "proud", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Evidence from the text?", answer: "helped carefully", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Vocabulary in context: stall", answer: "market table", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What have you learned?", answer: "use evidence", explanation: "ok", hints: ["a"], kind: "reflection" },
    ],
    generationStatus: "ok",
  }, "guided-reading")!;
  const issues = validateShortLearningInstructionalDepth({
    pack,
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
  });
  assert.ok(issues.some((i) => i.code === "sl_reading_thin_passage"));
});

test("105 minutes remains unavailable", () => {
  assert.equal(isShortLearningAdminDuration(105), false);
  assert.equal(isShortLearningAdminDuration(90), true);
  assert.equal(isShortLearningAdminDuration(120), true);
});

test("excessive near-clone practice prompts are rejected", () => {
  const pack = richMathsLessonPack({
    questions: [
      { prompt: "Calculate 21 × 4", answer: "84", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Calculate 22 × 4", answer: "88", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Calculate 23 × 4", answer: "92", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Calculate 24 × 4", answer: "96", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Calculate 25 × 4", answer: "100", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Calculate 26 × 4", answer: "104", explanation: "ok", hints: ["a", "b"] },
    ],
  });
  const issues = validateShortLearningInstructionalDepth({
    pack,
    mode: "maths",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
  });
  assert.ok(issues.some((i) => i.code === "sl_excessive_repetition"));
});

test("numeric worked-example answers are preserved during normalize", () => {
  const pack = normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Core",
    estimatedMinutes: 15,
    targetItems: 2,
    explanation: "Use partitioning.",
    workedExamples: [
      { question: "12 × 5", steps: ["10×5=50", "2×5=10", "50+10=60"], answer: 60 },
      { question: "15 × 4", steps: ["10×4=40", "5×4=20", "40+20=60"], answer: 60 },
    ],
    activities: [
      { kind: "teacher-explanation", estimatedMinutes: 5 },
      { kind: "scaffold", estimatedMinutes: 5 },
      { kind: "independent", estimatedMinutes: 5 },
    ],
    questions: [{ prompt: "14 × 3?", answer: 42, explanation: "ok", hints: ["a", "b"] }],
    generationStatus: "ok",
  }, "maths");
  assert.ok(pack);
  assert.equal(pack!.workedExamples?.length, 2);
  assert.equal(pack!.workedExamples?.[0]?.answer, "60");
});