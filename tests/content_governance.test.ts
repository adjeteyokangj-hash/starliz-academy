import assert from "node:assert/strict";
import test from "node:test";

import { taskHrefForContentType } from "../src/lib/assignments";
import { classifySpellingContentRecord, buildSpellingContentGovernanceReport, validateSpellingContentContract } from "../src/lib/content-governance";
import { mapSubjectToLegacyContentType } from "../src/lib/curriculum";

function makeRecord(overrides: Partial<Parameters<typeof classifySpellingContentRecord>[0]> = {}) {
  return {
    id: "content-1",
    contentType: "spelling",
    createdAt: "2026-05-29T17:26:32.872Z",
    createdBy: "admin@example.com",
    topic: "Plot development practice",
    level: 5,
    metadataJson: JSON.stringify({
      source: "ai-generator",
      generationType: "spelling",
      itemSchema: "spelling",
      subject: "spelling",
      legacyType: "spelling",
    }),
    contentJson: JSON.stringify([{ id: "1", type: "spelling", questionType: "spelling", word: "boat", sentenceContext: "The boat is red." }]),
    assignments: [],
    ...overrides,
  };
}

test("grammar, punctuation, and writing no longer fall through to spelling", () => {
  assert.equal(mapSubjectToLegacyContentType("grammar"), "grammar");
  assert.equal(mapSubjectToLegacyContentType("punctuation"), "punctuation");
  assert.equal(mapSubjectToLegacyContentType("writing"), "writing");
  assert.equal(mapSubjectToLegacyContentType("math"), "math");
  assert.equal(mapSubjectToLegacyContentType("science"), "science");
  assert.equal(mapSubjectToLegacyContentType("unknown-subject"), null);
  assert.equal(taskHrefForContentType("writing"), "/games/lesson");
  assert.equal(taskHrefForContentType("grammar"), "/games/lesson");
  assert.equal(taskHrefForContentType("punctuation"), "/games/lesson");
});

test("spelling content requires a word and rejects writing-style payloads", () => {
  const invalid = validateSpellingContentContract([
    {
      id: "task1",
      prompt: "Write a short story about a dragon.",
      question: "Write a short story about a dragon.",
      answer: "A dragon story.",
    },
  ]);

  assert.equal(invalid.ok, false);
  assert.equal(invalid.reasonCode, "writing_content_in_spelling");

  const missingWord = validateSpellingContentContract([
    {
      id: "task2",
      questionType: "spelling",
      sentenceContext: "The boat is red.",
    },
  ]);

  assert.equal(missingWord.ok, false);
  assert.equal(missingWord.reasonCode, "missing_spelling_word");
});

test("contaminated spelling content is rejected from assignment flow", () => {
  const rejected = validateSpellingContentContract([
    {
      id: "task1",
      type: "writing",
      prompt: "Write a short story that begins with a mystery.",
      question: "Write a short story that begins with a mystery.",
      answer: "Story answer.",
    },
  ]);

  assert.equal(rejected.ok, false);
  assert.equal(rejected.reasonCode, "writing_content_in_spelling");
});

test("governance detector classifies critical, high, and medium contamination", () => {
  const report = buildSpellingContentGovernanceReport([
    makeRecord({
      id: "critical-writing",
      createdAt: "2026-05-29T17:26:32.872Z",
      metadataJson: JSON.stringify({
        source: "ai-generator",
        generationType: "writing",
        itemSchema: "writing",
        subject: "writing",
        legacyType: "spelling",
      }),
      contentJson: JSON.stringify([
        {
          id: "task1",
          type: "writing",
          prompt: "Write a short story that begins with a mystery.",
          question: "Write a short story that begins with a mystery.",
          answer: "Story answer.",
        },
      ]),
      assignments: [{ assignmentId: "assign-critical", studentId: "student-1", studentName: "Lizzy", assignmentStatus: "assigned" }],
    }),
    makeRecord({
      id: "high-grammar",
      createdAt: "2026-05-30T17:26:32.872Z",
      metadataJson: JSON.stringify({
        source: "ai-generator",
        generationType: "grammar",
        itemSchema: "grammar",
        subject: "grammar",
        legacyType: "spelling",
      }),
      contentJson: JSON.stringify([
        { id: "1", type: "spelling", questionType: "spelling", word: "boat", sentenceContext: "The boat is red." },
      ]),
      assignments: [{ assignmentId: "assign-high", studentId: "student-2", studentName: "Elizabeth", assignmentStatus: "assigned" }],
    }),
    makeRecord({
      id: "medium-spelling",
      createdAt: "2026-05-31T17:26:32.872Z",
      metadataJson: JSON.stringify({
        source: "ai-generator",
        generationType: "spelling",
        itemSchema: "spelling",
        subject: "spelling",
        legacyType: "spelling",
      }),
      contentJson: JSON.stringify([
        { id: "1", type: "spelling", word: "boat", sentenceContext: "The boat is red." },
      ]),
      assignments: [{ assignmentId: "assign-medium", studentId: "student-3", studentName: "Atswei", assignmentStatus: "assigned" }],
    }),
  ]);

  assert.equal(report.severityCounts.CRITICAL, 1);
  assert.equal(report.severityCounts.HIGH, 1);
  assert.equal(report.severityCounts.MEDIUM, 1);
  assert.ok(report.contentIdsBySeverity.CRITICAL.includes("critical-writing"));
  assert.ok(report.contentIdsBySeverity.HIGH.includes("high-grammar"));
  assert.ok(report.contentIdsBySeverity.MEDIUM.includes("medium-spelling"));
  assert.equal(report.activeAssignmentsPointingToContaminatedContent, 3);
});
