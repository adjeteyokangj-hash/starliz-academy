import test from "node:test";
import assert from "node:assert/strict";
import { validateDaytimeStagePack, normalizeDaytimeStagePack } from "../src/lib/schools/daytime-stage-validators";
import {
  classifyShortLearningBlockIntent,
  ensureWorkedExampleFromPassage,
  instructionalDepthBudget,
  isGenericReadingComprehensionPrompt,
  isSkillAlignedEnglishPrompt,
  pickPassageSentenceForModel,
  shortLearningMinQuestionCount,
  usesQuotedPassageSpan,
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
      { prompt: "A tray holds 14 buns. How many buns are on 4 trays?", answer: "56", explanation: "10×4=40, 4×4=16, total 56.", hints: ["Partition 14", "Multiply each part by 4"] },
      { prompt: "Which array matches 6 × 4?", answer: "6 rows of 4", explanation: "An array of 6 rows with 4 in each row is 6 × 4.", hints: ["Rows times columns", "Not 6+4"] },
      { prompt: "Find the missing number: 9 × ? = 36", answer: "4", explanation: "36 ÷ 9 = 4, so the missing factor is 4.", hints: ["Use the inverse", "Count in nines to 36"] },
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

const BOOKSHOP_PASSAGE =
  "In a quiet village, there was a bookshop that seemed ordinary at first glance. However, the shop, which was filled with dusty shelves and old wooden tables, held secrets that many people did not know about. The owner, Mr Thompson, who wore round glasses and a tweed jacket, was known for his vast knowledge of stories. One rainy afternoon, a young girl named Lily entered the shop, seeking shelter. As she browsed the shelves, she discovered a peculiar book that shimmered in the light. The book, which had a golden cover and strange symbols, seemed to call out to her. Intrigued, Lily picked it up and noticed a note tucked inside. The note, which was written in elegant handwriting, promised adventures beyond her wildest dreams. Lily, who loved reading, decided to take the book home. Little did she know, the pages held magical tales that would change her life forever.";

function relativeClauseDepthPack(overrides: Record<string, unknown> = {}) {
  return normalizeDaytimeStagePack({
    subjectType: "guided-reading",
    title: "Lesson block 1 · New concept",
    estimatedMinutes: 18,
    targetItems: 9,
    learningObjective: "To understand and use relative clauses in sentences.",
    priorLearningWarmup: "Recall who, which and that.",
    explanation:
      "Relative clauses are groups of words that give extra information about a noun. They often start with who, which or that. In the passage, the phrase that describes the shop is a relative clause.",
    passage: {
      title: "The Mysterious Bookshop",
      text: BOOKSHOP_PASSAGE,
      paragraphs: BOOKSHOP_PASSAGE.split(". ").slice(0, 3),
      wordCount: BOOKSHOP_PASSAGE.split(/\s+/).length,
    },
    vocabulary: [
      { word: "peculiar", childFriendlyMeaning: "strange" },
      { word: "elegant", childFriendlyMeaning: "graceful" },
      { word: "vast", childFriendlyMeaning: "very large" },
    ],
    misconceptions: ["Thinking a relative clause is just any extra adjective"],
    reflectionCheck: "How confident are you at spotting relative clauses?",
    transitionNote: "Next we will practise rewriting sentences with relative clauses.",
    activities: [
      { kind: "fluency", estimatedMinutes: 2 },
      { kind: "read-passage", estimatedMinutes: 4 },
      { kind: "teacher-explanation", estimatedMinutes: 3 },
      { kind: "scaffold", estimatedMinutes: 3 },
      { kind: "short-answer", estimatedMinutes: 3 },
      { kind: "reasoning", estimatedMinutes: 2 },
      { kind: "reflection", estimatedMinutes: 1 },
    ],
    workedExamples: [
      {
        question: "Identify the relative clause in: 'The shop, which was filled with dusty shelves and old wooden tables, held secrets.'",
        steps: [
          "Find the noun being described: the shop.",
          "The extra information starts with which.",
          "The relative clause is which was filled with dusty shelves and old wooden tables.",
        ],
        answer: "which was filled with dusty shelves and old wooden tables",
      },
    ],
    questions: [
      { prompt: "Identify the relative clause in: 'The owner, Mr Thompson, who wore round glasses and a tweed jacket, was known for his stories.'", answer: "who wore round glasses and a tweed jacket", explanation: "Who adds extra information about Mr Thompson.", hints: ["Look after who", "It describes Mr Thompson"] },
      { prompt: "Find the relative clause that starts with which in the sentence about the book.", answer: "which had a golden cover and strange symbols", explanation: "Which describes the book.", hints: ["Find which", "The extra information about the book"] },
      { prompt: "Complete the sentence with a relative clause: 'Lily, ___, decided to take the book home.'", answer: "who loved reading", explanation: "Who loved reading describes Lily.", hints: ["Use who", "Lily loved reading"] },
      { prompt: "Rewrite using a relative clause: 'The note was inside the book. It was written in elegant handwriting.'", answer: "The note, which was written in elegant handwriting, was inside the book.", explanation: "Which joins the extra information.", hints: ["Use which", "Keep the extra detail"] },
      { prompt: "Combine these sentences with who: 'Lily entered the shop. She was seeking shelter.'", answer: "Lily, who was seeking shelter, entered the shop.", explanation: "Who adds the extra clause.", hints: ["Use who", "Add extra information"] },
      { prompt: "Which word introduces the relative clause in 'Lily, who loved reading, decided to take the book home'?", answer: "who", explanation: "Who introduces extra information about a person.", hints: ["Person word", "Not which"] },
      { prompt: "What extra information does the relative clause 'which was written in elegant handwriting' give?", answer: "It tells us more about the note.", explanation: "The clause describes the note.", hints: ["Which noun?", "The note"] },
      { prompt: "Create a sentence using a relative clause about Mr Thompson.", answer: "Mr Thompson, who wore round glasses, owned the shop.", explanation: "Who adds extra information about him.", hints: ["Use who", "Quote a detail from the passage"] },
      { prompt: "Explain why 'that shimmered in the light' is a relative clause.", answer: "It starts with that and adds extra information about the book.", explanation: "That-clauses can give extra information about a noun.", hints: ["Look at that", "What noun is described?"] },
    ],
    generationStatus: "ok",
    ...overrides,
  }, "guided-reading")!;
}

test("grammar skill practice mismatch is rejected even when a shared passage exists", () => {
  const pack = relativeClauseDepthPack({
    questions: [
      { prompt: "What did Lily find in the bookshop?", answer: "a peculiar book", explanation: "ok", hints: ["a", "b"] },
      { prompt: "How did Lily feel when she read the stories?", answer: "amazed", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What is the main idea of the passage?", answer: "A magical bookshop", explanation: "ok", hints: ["a", "b"] },
      { prompt: "How does the author create a sense of mystery?", answer: "shimmered", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Who was the owner of the bookshop?", answer: "Mr Thompson", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What did the note inside the book promise?", answer: "adventures", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What kind of cover did the book have?", answer: "golden", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What can we infer about Lily's character?", answer: "she loves reading", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What do you think will happen next?", answer: "an adventure", explanation: "ok", hints: ["a", "b"] },
    ],
  });
  const issues = validateShortLearningInstructionalDepth({
    pack,
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
    skillFocus: "Relative clauses",
  });
  assert.ok(issues.some((i) => i.code === "sl_skill_practice_mismatch"));
});

test("relative-clause practice on the shared passage passes skill alignment", () => {
  const pack = relativeClauseDepthPack();
  const issues = validateShortLearningInstructionalDepth({
    pack,
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
    skillFocus: "Relative clauses",
  });
  assert.equal(issues.filter((i) => i.code.startsWith("sl_skill") || i.code === "sl_model_not_from_passage").length, 0);
});

test("reading-inference packs may still use comprehension questions", () => {
  const pack = relativeClauseDepthPack({
    learningObjective: "To infer character motives from evidence.",
    explanation: "Inference means reading between the lines using clues in the passage. Look for evidence about how Lily feels.",
    questions: [
      { prompt: "What can we infer about Lily from the passage?", answer: "She loves reading", explanation: "ok", hints: ["a", "b"] },
      { prompt: "How does the author create a sense of mystery?", answer: "The book shimmered and seemed to call out", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What evidence shows the bookshop is unusual?", answer: "It held secrets people did not know", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Why might Lily have taken the book home?", answer: "She loved reading and the note promised adventures", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What did Lily find in the bookshop?", answer: "a peculiar book", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Which clue suggests the book is magical?", answer: "It shimmered and seemed to call out", explanation: "ok", hints: ["a", "b"] },
      { prompt: "How do we know Mr Thompson is knowledgeable?", answer: "He was known for his vast knowledge of stories", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What is the main idea of the passage?", answer: "A girl finds a mysterious book", explanation: "ok", hints: ["a", "b"] },
      { prompt: "What have you learned about inference?", answer: "Use evidence", explanation: "ok", hints: ["a"], kind: "reflection" },
    ],
  });
  const issues = validateShortLearningInstructionalDepth({
    pack,
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 1 · New concept",
    targetMinutes: 18,
    skillFocus: "Reading inference",
  });
  assert.equal(issues.some((i) => i.code === "sl_skill_practice_mismatch"), false);
});

test("final review still requires mixed retrieval rather than a weakened count", () => {
  assert.equal(shortLearningMinQuestionCount("Final review", 5), 4);
  const pack = normalizeDaytimeStagePack({
    subjectType: "maths",
    title: "Final review",
    estimatedMinutes: 5,
    targetItems: 3,
    learningObjective: "Review written methods.",
    explanation: "Today we recapped partitioning to multiply, checked a common place-value mistake, and practised applying the method independently.",
    activities: [{ kind: "reasoning", estimatedMinutes: 5 }],
    misconceptions: ["Adding instead of multiplying the ones"],
    reflectionCheck: "How confident are you now?",
    transitionNote: "Next, practise multiplying a 2-digit number by 5.",
    questions: [
      { prompt: "What is 21 × 4?", answer: "84", explanation: "ok", hints: ["a", "b"] },
      { prompt: "Explain why 25 × 4 is not 29.", answer: "Because we multiply, not add.", explanation: "ok", hints: ["a", "b"], kind: "reasoning" },
      { prompt: "How confident are you?", answer: "open", explanation: "ok", hints: ["a"], kind: "reflection" },
    ],
    generationStatus: "ok",
  }, "maths")!;
  const issues = validateShortLearningInstructionalDepth({
    pack,
    mode: "maths",
    stage: "stretch",
    stageLabel: "Final review",
    targetMinutes: 5,
  });
  assert.ok(issues.some((i) => i.code === "sl_review_thin_retrieval"));
});

test("generic comprehension stems are detected without treating grammar prompts as plot quizzes", () => {
  assert.equal(isGenericReadingComprehensionPrompt("What did Lily find in the bookshop?"), true);
  assert.equal(isSkillAlignedEnglishPrompt("Identify the relative clause in this passage sentence.", "Relative clauses"), true);
  assert.equal(isSkillAlignedEnglishPrompt("What did Lily find in the bookshop?", "Relative clauses"), false);
});

test("Harder questions can be repaired with a quoted passage model without weakening the validator", () => {
  const sentence = pickPassageSentenceForModel(BOOKSHOP_PASSAGE);
  assert.ok(sentence);
  assert.ok(usesQuotedPassageSpan(sentence!, BOOKSHOP_PASSAGE));

  const pack = relativeClauseDepthPack({
    title: "Lesson block 3 · Harder questions",
    workedExamples: [
      {
        question: "Identify the relative clause in 'The girl who has a red backpack is my friend.'",
        steps: ["Find who", "Name the clause"],
        answer: "who has a red backpack",
      },
    ],
  });
  assert.equal(
    usesQuotedPassageSpan(
      `${pack.workedExamples?.[0]?.question} ${pack.workedExamples?.[0]?.answer}`,
      BOOKSHOP_PASSAGE,
    ),
    false,
  );
  const before = validateShortLearningInstructionalDepth({
    pack,
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 3 · Harder questions",
    targetMinutes: 14,
    skillFocus: "Relative clauses",
  });
  assert.ok(before.some((issue) => issue.code === "sl_model_not_from_passage"));

  ensureWorkedExampleFromPassage(pack, "Relative clauses");
  const quoted = pack.workedExamples?.some((example) =>
    usesQuotedPassageSpan(
      `${example.question} ${(example.steps ?? []).join(" ")} ${example.answer ?? ""}`,
      BOOKSHOP_PASSAGE,
    ),
  );
  assert.equal(quoted, true);
  const after = validateShortLearningInstructionalDepth({
    pack,
    mode: "guided-reading",
    stage: "core",
    stageLabel: "Lesson block 3 · Harder questions",
    targetMinutes: 14,
    skillFocus: "Relative clauses",
  });
  assert.equal(after.some((issue) => issue.code === "sl_model_not_from_passage"), false);
});