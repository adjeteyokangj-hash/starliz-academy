import assert from "node:assert/strict";
import test from "node:test";

import {
  repairMissingCorrectAnswer,
  repairDuplicateChoices,
  improveReadability,
  strengthenExplanation,
  increaseDifficulty,
  fixTopicMatch,
  classifyRepairsForBatch,
  isSafeRepair,
} from "@/lib/ai/content-repair";

test.describe("Content Repair System", () => {
  test("repair missing correct answer injects answer into choices", () => {
    const item = {
      index: 0,
      question: "What is 2+2?",
      answer: "4",
      choices: ["2", "3", "5"],
    };

    const result = repairMissingCorrectAnswer({
      item,
      correctAnswer: "4",
    });

    assert.equal(result.success, true);
    assert.equal(result.actionType, "fix_choices");
    const newChoices = result.after.choices as string[];
    assert.ok(newChoices.includes("4"), "Correct answer should be injected");
    assert.equal(newChoices.length, 4);
  });

  test("repair missing correct answer fails if already present", () => {
    const item = {
      index: 0,
      question: "What is 2+2?",
      answer: "4",
      choices: ["4", "3", "5"],
    };

    const result = repairMissingCorrectAnswer({
      item,
      correctAnswer: "4",
    });

    assert.equal(result.success, false);
    assert.match(result.message, /already present/i);
  });

  test("repair duplicate choices removes duplicates", () => {
    const item = {
      index: 0,
      question: "Pick one",
      answer: "apple",
      choices: ["apple", "banana", "apple", "cherry"],
    };

    const result = repairDuplicateChoices({ item });

    assert.equal(result.success, true);
    const newChoices = result.after.choices as string[];
    assert.equal(newChoices.length, 3);
    assert.deepEqual(newChoices, ["apple", "banana", "cherry"]);
  });

  test("repair readability simplifies complex vocabulary", () => {
    const item = {
      index: 0,
      question: "Please elucidate the predominant methodology used to ascertain the result.",
    };

    const result = improveReadability({
      item,
      targetLevel: 2,
    });

    assert.equal(result.success, true);
    assert.ok(
      String(result.after.question).toLowerCase().includes("explain"),
      "Should simplify vocabulary"
    );
  });

  test("strengthen explanation expands thin explanations", () => {
    const item = {
      index: 0,
      question: "What is 2+2?",
      answer: "4",
      explanation: "4 is correct",
    };

    const result = strengthenExplanation({ item });

    assert.equal(result.success, true);
    const expanded = String(result.after.explanation);
    assert.ok(expanded.length > String(item.explanation).length);
  });

  test("increase difficulty adds reasoning requirements", () => {
    const item = {
      index: 0,
      question: "Calculate 5 × 6.",
      answer: "30",
      level: 2,
    };

    const result = increaseDifficulty({
      item,
      currentLevel: 2,
      targetLevel: 4,
    });

    assert.equal(result.success, true);
    assert.equal(result.after.level, 4);
    const question = String(result.after.question);
    assert.ok(
      question.toLowerCase().includes("explain"),
      "Should add reasoning requirement"
    );
  });

  test("fix topic match injects topic context", () => {
    const item = {
      index: 0,
      question: "30 × ? = 1080",
      answer: "36",
    };

    const result = fixTopicMatch({
      item,
      targetTopic: "Missing Factors",
    });

    assert.equal(result.success, true);
    const rewritten = String(result.after.question);
    assert.ok(
      rewritten.includes("factor") || rewritten.includes("Missing Factors"),
      "Should reference target topic"
    );
  });

  test("safe repair classification marks choice repairs as safe", () => {
    const { safe } = classifyRepairsForBatch([
      { reason: "Correct answer is not present in answer options.", itemIndex: 0 },
      { reason: "Multiple-choice item contains duplicate options.", itemIndex: 1 },
      { reason: "Vocabulary/readability appears too simple.", itemIndex: 2 },
    ]);

    assert.equal(safe.length, 2, "Should classify answer/choice repairs as safe");
  });

  test("is safe repair recognizes safe action types", () => {
    assert.equal(isSafeRepair("fix_choices"), true);
    assert.equal(isSafeRepair("improve_readability"), true);
    assert.equal(isSafeRepair("increase_difficulty"), false);
    assert.equal(isSafeRepair("strengthen_explanation"), false);
  });

  test("repair preserves unrelated item fields", () => {
    const item = {
      index: 0,
      question: "What is 2+2?",
      answer: "4",
      choices: ["3", "5"],
      hint: "Count on your fingers",
      coachSteps: ["Step 1", "Step 2"],
    };

    const result = repairMissingCorrectAnswer({
      item,
      correctAnswer: "4",
    });

    assert.equal(result.after.hint, item.hint, "Should preserve hint");
    assert.deepEqual(result.after.coachSteps, item.coachSteps, "Should preserve coach steps");
  });

  test("repair confidence level reflects risk", () => {
    const safeResult = repairMissingCorrectAnswer({
      item: { index: 0, question: "?", answer: "4", choices: ["3"] },
      correctAnswer: "4",
    });

    assert.equal(safeResult.confidence, "safe");

    const riskyResult = improveReadability({
      item: { index: 0, question: "Please elucidate the predominant methodology used to ascertain the result." },
      targetLevel: 2,
    });

    assert.equal(riskyResult.confidence, "needs_review");
  });
});
