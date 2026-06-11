import assert from "node:assert/strict";
import test from "node:test";

import { runContentBlackBoxTest } from "../src/lib/ai/content-black-box-test";

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
