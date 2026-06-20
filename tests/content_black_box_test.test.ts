import assert from "node:assert/strict";
import test from "node:test";

import { runContentBlackBoxTest } from "../src/lib/ai/content-black-box-test";
import { buildContentSaveBlockPayload } from "../src/app/api/admin/content/route-helpers";

const baseMathContext = {
  subject: "maths",
  strand: null,
  keyStage: "KS2",
  yearGroup: "Year 5",
  level: 3,
  difficulty: 3,
  topic: "Fractions",
  skillFocus: "Fractions",
};

const requestTuple = {
  yearGroup: "Year 5",
  keyStage: "KS2",
  subject: "maths",
  strand: null,
  skillFocus: "Fractions",
  difficulty: 3,
  itemCount: 1,
};

test("black box content test approves well-aligned generated content", () => {
  const result = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      question: "Calculate 3/4 of 240 and explain the method.",
      answer: "180",
      explanation: "Divide 240 by 4 to get 60, then multiply by 3 to get 180.",
      choices: ["180", "160", "120"],
      difficulty: 3,
    }],
  });

  assert.equal(result.decision, "APPROVE");
  assert.equal(result.reasons.length, 0);
});

test("black box content test recommends reclassification for wrong subject content", () => {
  const result = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "reading",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Inference",
      topic: "Inference",
      passage: "The old gate creaked as Maya stepped into the empty garden.",
      question: "What can you infer about the garden?",
      answer: "It feels mysterious or abandoned.",
      explanation: "The creaking gate and empty garden create a mysterious mood.",
      choices: ["It feels mysterious or abandoned.", "It is crowded.", "It is noisy."],
      difficulty: 3,
    }],
  });

  assert.equal(result.decision, "RECLASSIFY");
  assert.equal(result.recommendation?.subject, "reading");
  assert.match(result.reasons.join(" "), /Expected maths, detected reading/i);
});

test("black box content test detects wrong subject even after selected metadata is stamped on the item", () => {
  const result = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      passage: "The old gate creaked as Maya stepped into the empty garden.",
      question: "What can you infer about the garden?",
      answer: "It feels mysterious or abandoned.",
      explanation: "The creaking gate and empty garden create a mysterious mood.",
      choices: ["It feels mysterious or abandoned.", "It is crowded.", "It is noisy."],
      difficulty: 3,
    }],
  });

  assert.equal(result.decision, "RECLASSIFY");
  assert.equal(result.recommendation?.subject, "reading");
  assert.match(result.reasons.join(" "), /Expected maths, detected reading/i);
});

test("black box content test rejects wrong key stage content", () => {
  const result = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS4",
      yearGroup: "Year 10",
      skillFocus: "Algebra",
      topic: "Algebra",
      question: "Solve the simultaneous equations 2x + y = 11 and x - y = 1.",
      answer: "x = 4, y = 3",
      explanation: "Add the equations to get 3x = 12, so x = 4 and y = 3.",
      difficulty: 4,
    }],
  });

  assert.equal(result.decision, "REJECT");
  assert.match(result.reasons.join(" "), /Expected KS2, item is KS4/i);
});

test("black box content test recommends reclassification for wrong strand", () => {
  const result = runContentBlackBoxTest({
    subject: "english-language",
    strand: "reading",
    keyStage: "KS2",
    yearGroup: "Year 4",
    level: 3,
    difficulty: 3,
    topic: "Inference",
    skillFocus: "Inference",
    items: [{
      subject: "grammar",
      strand: "grammar",
      keyStage: "KS2",
      yearGroup: "Year 4",
      skillFocus: "Nouns and verbs",
      topic: "Grammar",
      question: "Identify the verb in this sentence: The fox leapt over the wall.",
      answer: "leapt",
      explanation: "Leapt is the action word, so it is the verb.",
      choices: ["fox", "leapt", "wall"],
      difficulty: 3,
    }],
  });

  assert.equal(result.decision, "RECLASSIFY");
  assert.equal(result.recommendation?.strand, "grammar");
});

test("black box content test sends too-hard content to admin review", () => {
  const result = runContentBlackBoxTest({
    subject: "maths",
    keyStage: "KS1",
    yearGroup: "Year 2",
    level: 1,
    difficulty: 1,
    topic: "Addition",
    skillFocus: "Addition",
    items: [{
      subject: "maths",
      keyStage: "KS1",
      yearGroup: "Year 2",
      skillFocus: "Addition",
      topic: "Addition",
      question: "Calculate the missing value in 3x + 5 = 20, then justify each inverse operation in your method.",
      answer: "x = 5",
      explanation: "Subtract 5 from both sides and divide by 3.",
      difficulty: 1,
    }],
  });

  assert.equal(result.decision, "NEEDS_ADMIN_REVIEW");
  assert.match(result.reasons.join(" "), /too hard/i);
});

test("black box content test sends too-easy content to admin review", () => {
  const result = runContentBlackBoxTest({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 6",
    level: 5,
    difficulty: 5,
    topic: "Problem solving",
    skillFocus: "Problem solving",
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 6",
      skillFocus: "Problem solving",
      topic: "Problem solving",
      question: "What is 2 + 2?",
      answer: "4",
      explanation: "Two plus two equals four.",
      choices: ["4", "5", "6"],
      difficulty: 5,
    }],
  });

  assert.equal(result.decision, "NEEDS_ADMIN_REVIEW");
  assert.match(result.reasons.join(" "), /too easy|too simple/i);
});

test("black box content test flags simple times-table facts as too easy for difficulty 5", () => {
  const result = runContentBlackBoxTest({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 4",
    level: 5,
    difficulty: 5,
    topic: "Times Tables",
    skillFocus: "Multiplication facts",
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 4",
      skillFocus: "Multiplication facts",
      topic: "Times Tables",
      question: "What is 6 times 4?",
      answer: "24",
      explanation: "6 times 4 equals 24.",
      choices: ["24", "20", "28"],
      difficulty: 5,
    }],
  });

  const item = result.itemResults[0];
  assert.equal(result.decision, "NEEDS_ADMIN_REVIEW");
  assert.equal(item.estimatedLevel <= 3, true);
  assert.match(result.reasons.join(" "), /too easy/i);
});

test("black box content test estimates rich applied prefix item as level 5", () => {
  const result = runContentBlackBoxTest({
    subject: "english-language",
    strand: "spelling",
    keyStage: "KS2",
    yearGroup: "Year 4",
    level: 5,
    difficulty: 5,
    topic: "Prefixes practice",
    skillFocus: "Prefixes",
    questionType: "spelling",
    items: [{
      word: "recreate",
      question: "Compare the options and revise the sentence so the prefix shows doing the action again: I will create a new drawing.",
      answer: "I will recreate a new drawing.",
      options: [
        "I will recreate a new drawing.",
        "I will miscreate a new drawing.",
        "I will precreate a new drawing.",
      ],
      explanation: "The correct answer is recreate because re- means again. Miscreate is a tempting distractor, but mis- suggests wrongly or badly, which does not fit the context.",
      hint: "Compare the time clue with the prefix meaning.",
      sentenceContext: "The sentence needs a prefix that means again.",
      subject: "english-language",
      strand: "spelling",
      yearGroup: "Year 4",
      keyStage: "KS2",
      difficulty: 5,
      skillFocus: "Prefixes",
    }],
  });

  const item = result.itemResults[0];
  assert.equal(item.estimatedLevel, 5);
  assert.equal(item.reasons.some((reason) => /Correct answer is not present/.test(reason)), false);
  assert.equal(item.reasons.some((reason) => /Expected spelling, detected multiple choice/.test(reason)), false);
});

test("black box content test rejects missing answer", () => {
  const result = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      question: "Calculate 1/2 of 80.",
      explanation: "Divide 80 by 2.",
      difficulty: 3,
    }],
  });

  assert.equal(result.decision, "REJECT");
  assert.match(result.reasons.join(" "), /Missing correct answer/i);
});

test("black box content test rejects bad options", () => {
  const result = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      question: "Calculate 1/2 of 80.",
      answer: "40",
      explanation: "Divide 80 by 2.",
      choices: ["30", "50", "60"],
      difficulty: 3,
    }],
  });

  assert.equal(result.decision, "REJECT");
  assert.match(result.reasons.join(" "), /Correct answer is not present/i);
});

test("black box content test exposes reclassify recommendation", () => {
  const result = runContentBlackBoxTest({
    subject: "english-language",
    strand: "reading",
    keyStage: "KS2",
    yearGroup: "Year 4",
    level: 3,
    difficulty: 3,
    topic: "Comprehension",
    skillFocus: "Reading comprehension",
    items: [{
      subject: "spelling",
      strand: "spelling",
      keyStage: "KS2",
      yearGroup: "Year 4",
      skillFocus: "Prefixes",
      topic: "Prefix patterns",
      word: "misbehave",
      question: "Spell the prefix word misbehave.",
      answer: "misbehave",
      hint: "The prefix is mis-.",
      sentenceContext: "Please do not misbehave during the visit.",
      explanation: "Mis- changes the meaning to wrong or badly.",
      difficulty: 3,
    }],
  });

  assert.equal(result.decision, "RECLASSIFY");
  assert.deepEqual(result.recommendation, { subject: "spelling", strand: "spelling" });
});

test("black box content test exposes item level recommendation", () => {
  const result = runContentBlackBoxTest({
    subject: "maths",
    strand: null,
    keyStage: "KS2",
    yearGroup: "Year 6",
    level: 5,
    difficulty: 5,
    topic: "Algebra",
    skillFocus: "Algebra",
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 6",
      skillFocus: "Algebra",
      topic: "Algebra",
      difficulty: 2,
      question: "Solve 3x + 5 = 20 and justify each inverse operation in your method.",
      answer: "x = 5",
      explanation: "Subtract 5 from both sides, then divide both sides by 3.",
    }],
  });

  const item = result.itemResults[0];
  assert.equal(item.declaredLevel, 2);
  assert.equal(item.estimatedLevel > item.declaredLevel, true);
  assert.equal(item.recommendedLevel, item.estimatedLevel);
  assert.equal(item.levelDelta, item.estimatedLevel - item.declaredLevel);
  assert.equal(item.levelRecommendation.action, "promote");
  assert.match(item.levelRecommendation.reason, /Increase question difficulty/i);
});

test("blocked wrong-subject save payload includes black box diagnostics", () => {
  const blackBoxContentTest = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      passage: "The old gate creaked as Maya stepped into the empty garden.",
      question: "What can you infer about the garden?",
      answer: "It feels mysterious or abandoned.",
      explanation: "The creaking gate and empty garden create a mysterious mood.",
    }],
  });

  const payload = buildContentSaveBlockPayload({
    error: "Generated content did not match the selected subject.",
    diagnosticOutcome: "save_blocked",
    requestTuple,
    blackBoxContentTest,
  });

  assert.equal(payload.blackBoxContentTest?.decision, "RECLASSIFY");
  assert.match(payload.blackBoxContentTest?.reasons.join(" ") ?? "", /Expected maths, detected reading/i);
});

test("blocked missing-answer save payload includes black box diagnostics", () => {
  const blackBoxContentTest = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      question: "Calculate 1/2 of 80.",
      explanation: "Divide 80 by 2.",
      difficulty: 3,
    }],
  });

  const payload = buildContentSaveBlockPayload({
    error: "Generated content must include an answer.",
    diagnosticOutcome: "save_blocked",
    requestTuple,
    blackBoxContentTest,
  });

  assert.equal(payload.blackBoxContentTest?.decision, "REJECT");
  assert.match(payload.blackBoxContentTest?.reasons.join(" ") ?? "", /Missing correct answer/i);
});

test("blocked invalid-options save payload includes black box diagnostics", () => {
  const blackBoxContentTest = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      question: "Calculate 1/2 of 80.",
      answer: "40",
      explanation: "Divide 80 by 2.",
      choices: ["30", "50", "60"],
      difficulty: 3,
    }],
  });

  const payload = buildContentSaveBlockPayload({
    error: "Black box content test rejected generated content.",
    diagnosticOutcome: "invalid_generated_content",
    requestTuple,
    blackBoxContentTest,
  });

  assert.equal(payload.blackBoxContentTest?.decision, "REJECT");
  assert.match(payload.blackBoxContentTest?.reasons.join(" ") ?? "", /Correct answer is not present/i);
});

test("valid generated content can carry black box metadata without promotion", () => {
  const blackBoxContentTest = runContentBlackBoxTest({
    ...baseMathContext,
    items: [{
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      topic: "Fractions",
      question: "Calculate 3/4 of 240 and explain the method.",
      answer: "180",
      explanation: "Divide 240 by 4 to get 60, then multiply by 3 to get 180.",
      choices: ["180", "160", "120"],
      difficulty: 3,
    }],
  });
  const metadata = {
    approvalStatus: "generated",
    blackBoxContentTest,
  };

  assert.equal(metadata.approvalStatus, "generated");
  assert.equal(metadata.blackBoxContentTest.decision, "APPROVE");
});

test("black box calibration caps displayed score at 74 when 50%+ items have level-quality warnings", () => {
  const result = runContentBlackBoxTest({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 6",
    level: 5,
    difficulty: 5,
    topic: "Problem solving",
    skillFocus: "Problem solving",
    items: Array.from({ length: 10 }, (_, index) => ({
      subject: "maths",
      keyStage: "KS2",
      yearGroup: "Year 6",
      topic: "Problem solving",
      skillFocus: "Problem solving",
      difficulty: 5,
      question: `What is ${index + 2} + 2?`,
      answer: String(index + 4),
      explanation: "Add the two numbers.",
      choices: [String(index + 4), String(index + 3), String(index + 5)],
    })),
  });

  assert.equal(result.decision, "NEEDS_ADMIN_REVIEW");
  assert.equal(result.passRate <= 0.74, true);
  assert.equal(result.scoreCap?.capPercent, 74);
  assert.match(result.reasons.join(" "), /Score capped at 74/i);
});

test("black box calibration caps displayed score at 81 when 30%+ items have level-quality warnings", () => {
  const easierItems = Array.from({ length: 3 }, (_, index) => ({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    topic: "Fractions",
    skillFocus: "Fractions",
    difficulty: 3,
    question: `What is ${index + 2} + 2?`,
    answer: String(index + 4),
    explanation: "Add the two numbers.",
    choices: [String(index + 4), String(index + 3), String(index + 5)],
  }));

  const alignedItems = Array.from({ length: 7 }, (_, index) => ({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    topic: "Fractions",
    skillFocus: "Fractions",
    difficulty: 3,
    question: `A tank is 3/5 full with ${150 + (index * 10)} litres. What is the total capacity? Show your reasoning.`,
    answer: `${250 + (index * 50)} litres`,
    explanation: "If 3/5 is known, divide by 3 to find 1/5, then multiply by 5 to find the full amount.",
    choices: [`${250 + (index * 50)} litres`, `${240 + (index * 50)} litres`, `${260 + (index * 50)} litres`],
  }));

  const result = runContentBlackBoxTest({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    level: 3,
    difficulty: 3,
    topic: "Fractions",
    skillFocus: "Fractions",
    items: [...easierItems, ...alignedItems],
  });

  assert.equal(result.passRate <= 0.81, true);
  assert.equal(result.scoreCap?.capPercent, 81);
  assert.match(result.reasons.join(" "), /Score capped at 81/i);
});

test("black box calibration caps displayed score at 59 when any item is rejected", () => {
  const result = runContentBlackBoxTest({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    level: 3,
    difficulty: 3,
    topic: "Fractions",
    skillFocus: "Fractions",
    items: [
      {
        subject: "maths",
        keyStage: "KS2",
        yearGroup: "Year 5",
        topic: "Fractions",
        skillFocus: "Fractions",
        question: "Calculate 1/2 of 80.",
        explanation: "Divide by 2.",
        difficulty: 3,
      },
      {
        subject: "maths",
        keyStage: "KS2",
        yearGroup: "Year 5",
        topic: "Fractions",
        skillFocus: "Fractions",
        question: "Calculate 3/4 of 240 and explain the method.",
        answer: "180",
        explanation: "Divide 240 by 4 to get 60, then multiply by 3 to get 180.",
        choices: ["180", "160", "120"],
        difficulty: 3,
      },
    ],
  });

  assert.equal(result.decision, "REJECT");
  assert.equal(result.passRate <= 0.59, true);
  assert.equal(result.scoreCap?.capPercent, 59);
  assert.match(result.reasons.join(" "), /Score capped at 59/i);
});

test("black box calibration keeps clean aligned content scoring high", () => {
  const result = runContentBlackBoxTest({
    subject: "maths",
    keyStage: "KS2",
    yearGroup: "Year 5",
    level: 3,
    difficulty: 3,
    topic: "Fractions",
    skillFocus: "Fractions",
    items: [
      {
        subject: "maths",
        keyStage: "KS2",
        yearGroup: "Year 5",
        skillFocus: "Fractions",
        topic: "Fractions",
        question: "Calculate 3/4 of 240 and explain the method.",
        answer: "180",
        explanation: "Divide 240 by 4 to get 60, then multiply by 3 to get 180.",
        choices: ["180", "160", "120"],
        difficulty: 3,
      },
      {
        subject: "maths",
        keyStage: "KS2",
        yearGroup: "Year 5",
        skillFocus: "Fractions",
        topic: "Fractions",
        question: "A tank is 3/5 full with 150 litres. What is the total capacity? Show your reasoning.",
        answer: "250 litres",
        explanation: "If 3/5 is 150, then 1/5 is 50 and 5/5 is 250.",
        choices: ["200 litres", "250 litres", "300 litres"],
        difficulty: 3,
      },
    ],
  });

  assert.equal(result.decision, "APPROVE");
  assert.equal(result.passRate >= 0.9, true);
  assert.equal(result.scoreCap, undefined);
});
