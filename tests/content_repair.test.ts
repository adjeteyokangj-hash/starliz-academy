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
  inferBlackBoxIssueType,
  runIssueSpecificRepair,
  runIssueSpecificRepairsForItem,
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

  test("issue type inference maps BlackBox reason text", () => {
    assert.equal(inferBlackBoxIssueType("Item appears too easy for the selected level."), "item_too_easy");
    assert.equal(inferBlackBoxIssueType("Item appears too hard for the selected level."), "item_too_hard");
    assert.equal(inferBlackBoxIssueType("Answer is too thin for the selected level."), "answer_too_thin");
    assert.equal(inferBlackBoxIssueType("Vocabulary/readability appears too simple."), "readability_too_simple");
    assert.equal(inferBlackBoxIssueType("Item 1: Missing question/prompt text."), "missing_question_prompt");
    assert.equal(inferBlackBoxIssueType("Item 1: Missing correct answer."), "missing_correct_answer");
    assert.equal(inferBlackBoxIssueType("Item 1: Curriculum quality block: reading_missing_passage"), "reading_missing_passage");
    assert.equal(inferBlackBoxIssueType("Item 1: Curriculum quality block: reading_missing_question"), "reading_missing_question");
    assert.equal(inferBlackBoxIssueType("Item 1: Curriculum quality block: reading_missing_answer"), "reading_missing_answer");
    assert.equal(inferBlackBoxIssueType("Item 1: Expected reading, detected unknown."), "reading_subject_mismatch");
    assert.equal(inferBlackBoxIssueType("Item 8: Multiple-choice item contains duplicate options."), "duplicate_options");
    assert.equal(inferBlackBoxIssueType("Item 8: Curriculum quality block: weak_distractors_duplicate_options"), "duplicate_options");
  });

  test("issue-specific repair fixes duplicate choices", () => {
    const result = runIssueSpecificRepair({
      item: {
        index: 7,
        question: "Choose the correct answer",
        answer: "65",
        choices: ["60", "65", "65", "70"],
      },
      itemIndex: 7,
      issueText: "Item 8: Multiple-choice item contains duplicate options.",
      selectedLevel: 5,
      selectedYearGroup: "Year 4",
      topic: "Addition reasoning",
    });

    assert.equal(result.success, true);
    assert.equal(result.issueType, "duplicate_options");
    assert.equal(result.actionType, "fix_choices");
    const afterChoices = Array.isArray(result.after.choices) ? result.after.choices as string[] : [];
    assert.equal(new Set(afterChoices.map((entry) => String(entry).toLowerCase())).size, afterChoices.length);
  });

  test("issue-specific repair supports missing reading structure and mismatch issues", () => {
    const baseItem = {
      index: 0,
      topic: "Reading Comprehension",
      question: "",
      prompt: "",
      answer: "",
      passage: "",
      level: 5,
      difficulty: 5,
    };

    const issueSamples = [
      "Item 1: Missing question/prompt text.",
      "Item 1: Missing correct answer.",
      "Item 1: Curriculum quality block: reading_missing_passage",
      "Item 1: Curriculum quality block: reading_missing_question",
      "Item 1: Curriculum quality block: reading_missing_answer",
      "Item 1: Expected reading, detected unknown.",
      "Item 1: Item appears too hard for the selected level.",
    ];

    for (const issueText of issueSamples) {
      const result = runIssueSpecificRepair({
        item: baseItem,
        itemIndex: 0,
        issueText,
        selectedLevel: 4,
        selectedYearGroup: "Year 6",
        topic: "Reading Comprehension",
      });

      assert.equal(result.success, true, `Expected supported repair for: ${issueText}`);
    }
  });

  test("issue-specific repair applies to exact item and includes context", () => {
    const baseItem = {
      index: 2,
      question: "What is 4 + 4?",
      answer: "8",
      difficulty: 1,
      level: 1,
    };

    const result = runIssueSpecificRepair({
      item: baseItem,
      itemIndex: 2,
      issueText: "Item appears too easy for the selected level.",
      selectedLevel: 4,
      selectedYearGroup: "Year 4",
      topic: "Addition",
    });

    assert.equal(result.success, true);
    assert.equal(result.itemIndex, 2);
    assert.equal(result.issueType, "item_too_easy");
    assert.equal(Number(result.after.level), 4);
  });

  test("fix all issues for one item mutates only that item", () => {
    const items = [
      {
        index: 0,
        question: "What is 1 + 1?",
        answer: "2",
        explanation: "2",
      },
      {
        index: 1,
        question: "Please elucidate the predominant methodology used to ascertain the result.",
        answer: "4",
        explanation: "4",
      },
      {
        index: 2,
        question: "What is 10 - 2?",
        answer: "8",
        explanation: "8",
      },
    ];

    const item1Before = JSON.stringify(items[1]);
    const item2Before = JSON.stringify(items[2]);

    const result = runIssueSpecificRepairsForItem({
      item: items[0],
      itemIndex: 0,
      issues: [
        "Answer is too thin for the selected level.",
        "Vocabulary/readability appears too simple.",
      ],
      selectedLevel: 3,
      selectedYearGroup: "Year 3",
      topic: "Addition",
    });

    assert.ok(result.applied.length >= 1);
    assert.notEqual(JSON.stringify(result.after), JSON.stringify(items[0]));
    assert.equal(JSON.stringify(items[1]), item1Before, "Unrelated item 2 should remain unchanged");
    assert.equal(JSON.stringify(items[2]), item2Before, "Unrelated item 3 should remain unchanged");
  });
});
