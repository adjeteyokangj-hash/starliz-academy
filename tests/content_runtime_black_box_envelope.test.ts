import assert from "node:assert/strict";
import test from "node:test";
import { runContentRuntimeBlackBoxTest } from "../src/lib/ai/content-runtime-black-box-test";

test("runtime Black Box validates Daytime stage item envelopes", () => {
  const item = {
    prompt: "What is one half of 10?",
    question: "What is one half of 10?",
    answer: "5",
    correctAnswer: "5",
    options: ["2", "5", "8", "10"],
    hint: "Divide 10 into two equal groups.",
    explanation: "One half means divide by two, so 10 ÷ 2 = 5.",
    skillFocus: "fractions",
  };

  const result = runContentRuntimeBlackBoxTest({
    contentType: "math",
    level: 3,
    topic: "fractions",
    skillFocus: "fractions",
    contentJson: JSON.stringify({
      subjectType: "maths",
      questions: [item],
      items: [item],
    }),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.reasons.length, 0);
});
