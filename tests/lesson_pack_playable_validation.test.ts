import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanMathsPrompt,
  detectVisualDependency,
  evaluateLessonActivities,
  hasFlattenedLayoutNoise,
  hasIncompleteMathExpression,
  validatePlayableActivity,
} from "../src/lib/lesson-pack-import/playable-validation";
import { validateAdminReconstruction } from "../src/lib/lesson-pack-import/admin-reconstruction";
import { runGlobalImportChecks, resolveSubjectValidationProfile } from "../src/lib/lesson-pack-import/import-validation";
import { validatePreDraft } from "../src/lib/lesson-pack-import/content-extraction";
import type { LinkedQaItem, LessonPackStructuredModel } from "../src/lib/lesson-pack-import/types";

function qa(partial: Partial<LinkedQaItem> & Pick<LinkedQaItem, "id" | "prompt">): LinkedQaItem {
  return {
    sourceComponent: "worksheet",
    markingMode: "guided_review",
    explanation: "Use place value and clear reasoning.",
    ...partial,
  };
}

function emptyModel(overrides: Partial<LessonPackStructuredModel> = {}): LessonPackStructuredModel {
  return {
    title: "Compose decimals",
    subject: null,
    yearGroup: null,
    keyStage: null,
    curriculumArea: null,
    learningObjective: "I can compose decimals.",
    lessonOutcome: null,
    keywords: [],
    priorKnowledge: [],
    teachingExplanations: [],
    workedExamples: [],
    guidedPractice: [],
    independentPractice: [],
    reflectionTasks: [],
    starterQuestions: [],
    starterAnswers: [],
    worksheetTasks: [],
    worksheetAnswers: [],
    exitQuestions: [],
    exitAnswers: [],
    misconceptions: [],
    teacherNotes: [],
    sourceMetadata: { providerHints: ["Oak National Academy"] },
    licenceMetadata: {},
    ...overrides,
  };
}

test("prompt referencing missing pictures is blocked", () => {
  const result = validatePlayableActivity(qa({
    id: "m1",
    prompt: "1) Match the pictures to the equation",
  }));
  assert.equal(result.playable, false);
  assert.ok(result.reasons.includes("missing_required_visual"));
  assert.equal(result.status, "needs_admin_reconstruction");
});

test("generic representation prompt is blocked", () => {
  const result = validatePlayableActivity(qa({
    id: "r1",
    prompt: "Complete the rounding representation task.",
  }));
  assert.equal(result.playable, false);
  assert.ok(result.reasons.includes("generic_representation_prompt") || result.reasons.includes("missing_question_values"));
});

test("incomplete decimal equation is blocked", () => {
  assert.equal(hasIncompleteMathExpression("0. = 1.4 − ."), true);
  const unclean = cleanMathsPrompt("3) Using the numbers 0-9 only once in each box, how many different ways can you make this equation equal? 0. = 1.4 − .");
  assert.ok(unclean);
  assert.equal(unclean!.mathExpression, "□.□ = 1.4 − □.□");
  assert.equal(hasIncompleteMathExpression(unclean!.prompt), false);
});

test("detached digit noise is rejected", () => {
  const noisy = "3) Using any of the digits 0-9 only once, fill in the missing numbers to make your number as close to 7.5 as possible. + 5 + 5 1";
  assert.equal(hasFlattenedLayoutNoise(noisy), true);
  const cleaned = cleanMathsPrompt(noisy);
  assert.ok(cleaned);
  assert.equal(cleaned!.mathExpression, "□.□ + □.□ = 7.5");
  assert.equal(hasFlattenedLayoutNoise(cleaned!.prompt), false);
});

test("missing-number boxes are preserved structurally", () => {
  const result = validatePlayableActivity(qa({
    id: "b1",
    prompt: "Use each digit from 0–9 no more than once to complete the calculation.",
    mathExpression: "□.□ + □.□ = 7.5",
    markingMode: "guided_review",
    explanation: "Digits used once; sum as close to 7.5 as possible.",
  }));
  assert.equal(result.playable, true);
  assert.ok(result.mathExpression?.includes("□"));
});

test("part-part-whole visual is reconstructed when self-contained", () => {
  const dep = detectVisualDependency("Complete the part-part-whole model for 103.2");
  assert.equal(dep.visualType, "part_part_whole");
  assert.equal(dep.selfContained, true);
  const result = validatePlayableActivity(qa({
    id: "ppw",
    prompt: "Complete the part-part-whole model for 103.2",
    explanation: "Partition into ones and tenths.",
  }));
  assert.equal(result.playable, true);
});

test("number-line task requires bounds and target unless round stem is complete", () => {
  const incomplete = validatePlayableActivity(qa({
    id: "nl1",
    prompt: "Use the number line to locate the decimals.",
  }));
  assert.equal(incomplete.playable, false);
  const complete = validatePlayableActivity(qa({
    id: "nl2",
    prompt: "Round 6.7 to the nearest whole number.",
    explanation: "6.7 is nearer to 7 than to 6.",
  }));
  assert.equal(complete.playable, true);
});

test("column calculation preserves decimal alignment when structured", () => {
  const result = validatePlayableActivity(qa({
    id: "col",
    prompt: "Complete the column calculation 12.45 + 3.6",
    mathExpression: "12.45 + 3.6",
    visualModel: {
      visualType: "column_calculation",
      topNumber: "12.45",
      bottomNumber: "3.6",
      operator: "+",
      decimalAlignment: true,
    },
    markingMode: "auto",
    answer: "16.05",
  }));
  assert.equal(result.playable, true);
  assert.equal(result.visualReconstructionStatus, "reconstructed");
});

test("activity with valid structured visual is playable", () => {
  const result = validatePlayableActivity(qa({
    id: "match",
    prompt: "Match the pictures to the equation",
    visualType: "matching_images",
    requiresVisual: true,
    visualModel: {
      visualType: "matching_images",
      pairs: [{ left: "2 groups of 0.4", right: "2 × 0.4 = 0.8" }],
      options: ["2 × 0.4 = 0.8", "0.4 + 0.4 = 0.8"],
    },
    explanation: "Pair each picture with its matching equation.",
  }));
  assert.equal(result.playable, true);
});

test("low-confidence visual becomes needs_admin_reconstruction", () => {
  const result = validatePlayableActivity(qa({
    id: "low",
    prompt: "Match the pictures to the equation",
    visualExtractionConfidence: "low",
  }));
  assert.equal(result.playable, false);
  assert.ok(result.reasons.includes("low_confidence_visual_reconstruction") || result.reasons.includes("missing_required_visual"));
});

test("blocked fragment does not count as student question", () => {
  const { playableItems, excludedItems, report } = evaluateLessonActivities([
    qa({ id: "ok", prompt: "Complete the part-part-whole model for 103.2", explanation: "Partition." }),
    qa({ id: "bad", prompt: "1) Match the pictures to the equation" }),
  ]);
  assert.equal(playableItems.length, 1);
  assert.equal(excludedItems.length, 1);
  assert.equal(report.excludedFromQuestionCount, 1);
});

test("all activities receive playable validation", () => {
  const items = [
    qa({ id: "a", prompt: "a) 1.8 = 1 + ___", markingMode: "auto", answer: "0.8" }),
    qa({ id: "b", prompt: "Complete the rounding representation task." }),
  ];
  const { report } = evaluateLessonActivities(items);
  assert.equal(report.activityResults.length, 2);
  assert.ok(report.activityResults.every((r) => r.status === "playable" || r.status === "blocked" || r.status === "needs_admin_reconstruction"));
});

test("lesson readiness reflects missing visuals", () => {
  const structured = emptyModel({
    worksheetTasks: [qa({ id: "m", prompt: "1) Match the pictures to the equation" })],
    sourceMetadata: {
      providerHints: ["Oak"],
      extractionMeta: {
        primarySources: [],
        guidanceGroups: 0,
        excludedFragments: 0,
        orphanCorrectAnswers: 0,
        questionsMissingAnswers: 0,
        autoMarked: 0,
        guidedReview: 1,
        needsAdminReconstruction: 1,
        missingVisuals: 1,
        playableActivities: 0,
      },
    },
  });
  // After filtering, model with only unplayable content should be empty / blocked
  const filtered = evaluateLessonActivities(structured.worksheetTasks);
  const readyModel = emptyModel({
    worksheetTasks: filtered.playableItems,
    sourceMetadata: {
      providerHints: ["Oak"],
      extractionMeta: {
        primarySources: [],
        guidanceGroups: 0,
        excludedFragments: filtered.report.excludedFromQuestionCount,
        orphanCorrectAnswers: 0,
        questionsMissingAnswers: 0,
        autoMarked: 0,
        guidedReview: 0,
        needsAdminReconstruction: filtered.report.needsReconstruction,
        missingVisuals: filtered.report.missingVisuals,
        playableActivities: 0,
      },
    },
  });
  const validation = validatePreDraft({
    structured: readyModel,
    sourceName: "Oak",
    licenceType: "OGL",
    attribution: "Adapted from Oak.",
    thirdPartyCount: 0,
    providerHints: ["Oak"],
  });
  assert.equal(validation.overallReady, false);
});

test("admin reconstruction validates maths structure", () => {
  const bad = validateAdminReconstruction({
    activityId: "x",
    prompt: "0. = 1.4 − .",
    markingMode: "guided_review",
    successCriteria: "Find all digit combinations.",
    action: "save",
  });
  assert.equal(bad.ok, false);

  const good = validateAdminReconstruction({
    activityId: "x",
    prompt: "Using digits 0-9 once each, complete the equation.",
    mathExpression: "□.□ = 1.4 − □.□",
    visualType: "missing_number_boxes",
    visualModel: {
      visualType: "missing_number_boxes",
      leftExpression: "□.□",
      operator: "-",
      rightExpression: "1.4 − □.□",
      digitConstraints: "0-9 once",
    },
    markingMode: "guided_review",
    successCriteria: "Count distinct valid digit placements.",
    action: "save",
  });
  assert.equal(good.ok, true);
});

test("global import checks are subject-aware", () => {
  assert.equal(resolveSubjectValidationProfile("Mathematics"), "maths");
  assert.equal(resolveSubjectValidationProfile("English"), "english");
  const checks = runGlobalImportChecks(emptyModel({
    worksheetTasks: [qa({ id: "ok", prompt: "Complete the part-part-whole model for 103.2", explanation: "Partition." })],
  }));
  assert.equal(checks.activitiesPlayable, true);
  assert.equal(checks.noAnswerSheetAsQuestion, true);
});
