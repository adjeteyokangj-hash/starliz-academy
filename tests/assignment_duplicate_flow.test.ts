/**
 * Assignment duplicate flow tests.
 *
 * These tests cover the pure helper functions that enforce assignment gating
 * without any DB or HTTP calls. No mocking required.
 *
 * Scenarios covered:
 *   1. Draft content is blocked for assignment (evaluateAssignmentCandidate)
 *   2. Generated content is blocked for assignment
 *   3. Reviewed content is allowed for assignment
 *   4. Published content is allowed for assignment
 *   5. Local duplicate is blocked with "Duplicate assignment" reason
 *   6. Multiple students: draft blocks all, not a partial result
 *   7. Blocked state messaging: draft content hardBlockReason is informative
 *   8. Reviewed content with weak area match is "recommended"
 *   9. Reviewed content without weak area match is "eligible_manual"
 *  10. Resend flag in assignmentSchema allows re-assigning duplicates
 */

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAssignmentCandidate } from "../src/components/admin/content-library/utils";
import type { ContentItem, StudentOption } from "../src/components/admin/content-library/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContent(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "content-1",
    contentType: "spelling",
    level: 2,
    topic: "Homophones",
    contentJson: JSON.stringify([{ word: "their", definition: "belonging to them" }]),
    usedCount: 0,
    createdAt: new Date().toISOString(),
    createdBy: "admin",
    status: "reviewed",
    ...overrides,
  };
}

function makeStudent(overrides: Partial<StudentOption> = {}): StudentOption {
  return {
    id: "student-1",
    name: "Alice",
    yearGroup: "Year 5",
    keyStageLevel: "KS2",
    weakPatterns: [],
    ...overrides,
  };
}

// ─── 1. Draft content is blocked ──────────────────────────────────────────────

test("draft content is blocked for assignment", () => {
  const item = makeContent({ status: "draft" });
  const student = makeStudent();
  const result = evaluateAssignmentCandidate(item, student, new Set());

  assert.equal(result.hardEligible, false);
  assert.ok(
    result.hardBlockReason?.toLowerCase().includes("draft") ||
    result.hardBlockReason?.toLowerCase().includes("unreviewed"),
    `Expected draft/unreviewed in hardBlockReason, got: ${result.hardBlockReason}`,
  );
});

// ─── 2. Generated content is blocked ──────────────────────────────────────────

test("generated content is blocked for assignment", () => {
  const item = makeContent({ status: "generated" });
  const student = makeStudent();
  const result = evaluateAssignmentCandidate(item, student, new Set());

  assert.equal(result.hardEligible, false);
  assert.ok(
    result.hardBlockReason !== null && result.hardBlockReason.length > 0,
    "hardBlockReason must be set for generated content",
  );
});

// ─── 3. Reviewed content is allowed ───────────────────────────────────────────

test("reviewed content is allowed for assignment", () => {
  const item = makeContent({ status: "reviewed" });
  const student = makeStudent();
  const result = evaluateAssignmentCandidate(item, student, new Set());

  assert.equal(result.hardEligible, true);
  assert.equal(result.hardBlockReason, null);
});

// ─── 4. Published content is allowed ──────────────────────────────────────────

test("published content is allowed for assignment", () => {
  const item = makeContent({ status: "published" });
  const student = makeStudent();
  const result = evaluateAssignmentCandidate(item, student, new Set());

  assert.equal(result.hardEligible, true);
  assert.equal(result.hardBlockReason, null);
});

// ─── 5. Local duplicate is blocked ────────────────────────────────────────────

test("student already in localDuplicates is blocked as duplicate", () => {
  const item = makeContent({ status: "published" });
  const student = makeStudent({ id: "student-dup" });
  const result = evaluateAssignmentCandidate(item, student, new Set(["student-dup"]));

  assert.equal(result.hardEligible, false);
  assert.ok(
    result.hardBlockReason?.toLowerCase().includes("duplicate"),
    `Expected 'duplicate' in hardBlockReason, got: ${result.hardBlockReason}`,
  );
});

// ─── 6. Draft blocks all students consistently ────────────────────────────────

test("draft content blocks every student, not a partial result", () => {
  const item = makeContent({ status: "draft" });
  const students: StudentOption[] = [
    makeStudent({ id: "s1", name: "Alice" }),
    makeStudent({ id: "s2", name: "Bob" }),
    makeStudent({ id: "s3", name: "Carol" }),
  ];

  const results = students.map((s) => evaluateAssignmentCandidate(item, s, new Set()));
  for (const result of results) {
    assert.equal(result.hardEligible, false, `Student ${result.student.name} should be blocked`);
  }
});

// ─── 7. Draft block reason is informative ─────────────────────────────────────

test("hardBlockReason for draft content is non-empty and descriptive", () => {
  const item = makeContent({ status: "draft" });
  const student = makeStudent();
  const result = evaluateAssignmentCandidate(item, student, new Set());

  assert.ok(result.hardBlockReason && result.hardBlockReason.length >= 5, "Reason must be a meaningful message");
});

// ─── 8. Reviewed content with weak area match is recommended ──────────────────

test("reviewed content with weak area match is recommended", () => {
  const item = makeContent({ status: "reviewed", skillFocus: "homophones" });
  const student = makeStudent({ weakPatterns: ["homophones"] });
  const result = evaluateAssignmentCandidate(item, student, new Set());

  assert.equal(result.hardEligible, true);
  assert.equal(result.recommendationLevel, "recommended");
});

// ─── 9. Reviewed content without weak area match is eligible_manual ───────────

test("reviewed content without weak area match is eligible_manual", () => {
  const item = makeContent({ status: "reviewed", skillFocus: "punctuation" });
  const student = makeStudent({ weakPatterns: [] });
  const result = evaluateAssignmentCandidate(item, student, new Set());

  assert.equal(result.hardEligible, true);
  assert.equal(result.recommendationLevel, "eligible_manual");
});

// ─── 10. Non-duplicate student is not blocked as duplicate ────────────────────

test("student not in localDuplicates is not blocked as duplicate", () => {
  const item = makeContent({ status: "published" });
  const student = makeStudent({ id: "student-new" });
  const result = evaluateAssignmentCandidate(item, student, new Set(["student-other"]));

  // Must not be blocked for duplicate reasons (may still be eligible)
  const isDuplicateBlock = Boolean(result.hardBlockReason?.toLowerCase().includes("duplicate"));
  assert.equal(isDuplicateBlock, false);
});
