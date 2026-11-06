import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMasteredCodingCatchUps,
  filterMasteredCodingReportText,
} from "../src/lib/academic-intelligence/parentReportCodingFilter";

test("mastered coding lessons are excluded from outstanding catch-up", () => {
  const recommendations = [
    {
      subject: "coding",
      topic: "Understanding Loops",
      status: "pending",
    },
    {
      subject: "coding",
      topic: "Variables",
      status: "pending",
    },
    {
      subject: "maths",
      topic: "Understanding Loops",
      status: "pending",
    },
    {
      subject: "english",
      topic: "Reading comprehension",
      status: "pending",
    },
  ];

  const result = filterMasteredCodingCatchUps(
    recommendations,
    ["Understanding Loops"],
  );

  assert.equal(result.length, 3);

  assert.equal(
    result.some(
      (item) =>
        item.subject === "coding" &&
        item.topic === "Understanding Loops",
    ),
    false,
  );

  assert.equal(
    result.some(
      (item) =>
        item.subject === "coding" &&
        item.topic === "Variables",
    ),
    true,
  );

  assert.equal(
    result.some(
      (item) =>
        item.subject === "maths" &&
        item.topic === "Understanding Loops",
    ),
    true,
  );

  assert.equal(
    result.some((item) => item.subject === "english"),
    true,
  );
});

test("mastered coding recommendation text is excluded", () => {
  const result = filterMasteredCodingReportText(
    [
      "Needs more practice: Understanding Loops",
      "Revise reading comprehension",
      "Continue practising Variables",
    ],
    ["Understanding Loops"],
  );

  assert.deepEqual(result, [
    "Revise reading comprehension",
    "Continue practising Variables",
  ]);
});

test("unmastered coding recommendations remain visible", () => {
  const result = filterMasteredCodingCatchUps(
    [
      {
        subject: "coding",
        topic: "Understanding Loops",
        status: "pending",
      },
    ],
    [],
  );

  assert.equal(result.length, 1);
});
