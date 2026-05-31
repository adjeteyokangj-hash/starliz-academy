/**
 * Phase 2 — Admin assignment eligibility override tests.
 *
 * These tests cover the pure functions that govern admin override behaviour
 * for assignment eligibility. No DB or HTTP calls. No mocking required.
 *
 * Scenarios:
 *  1. Reviewed content can be assigned with admin override despite year mismatch
 *  2. Reviewed content can be assigned with admin override despite key stage mismatch
 *  3. Reviewed content can be assigned with admin override despite age mismatch
 *  4. Draft content is hard-blocked even with adminOverride=true
 *  5. Generated content is hard-blocked even with adminOverride=true
 *  6. Reviewed content assigns successfully after review (no override needed)
 *  7. Bulk: multiple reviewed items assignable to same student
 *  8. Manual override requires a reason — year mismatch with no override produces overrideEligible flag
 *  9. Year mismatch without override returns hardEligible=false and overrideEligible=true
 * 10. Key stage mismatch without override returns hardEligible=false and overrideEligible=true
 * 11. Age mismatch without override returns hardEligible=false and overrideEligible=true
 * 12. School mismatch is never override-eligible (remains hard-blocked)
 * 13. Subject/type mismatch is never override-eligible (remains hard-blocked)
 * 14. Override with adminOverride=true lifts year mismatch to hardEligible=true
 * 15. Override with adminOverride=true lifts key stage mismatch to hardEligible=true
 */

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAssignmentCandidate } from "../src/components/admin/content-library/utils";
import type { ContentItem, StudentOption } from "../src/components/admin/content-library/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReviewedContent(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "content-reviewed",
    contentType: "maths",
    level: 1,
    topic: "Place value",
    contentJson: JSON.stringify([{ question: "What is 10 + 5?", answer: "15" }]),
    usedCount: 0,
    createdAt: new Date().toISOString(),
    createdBy: "admin",
    status: "reviewed",
    yearGroup: "Year 1",
    keyStage: "KS1",
    metadataJson: JSON.stringify({
      subject: "maths",
      yearGroup: "Year 1",
      keyStage: "KS1",
    }),
    ...overrides,
  };
}

function makeYear4Student(overrides: Partial<StudentOption> = {}): StudentOption {
  return {
    id: "student-elizabeth",
    name: "Elizabeth",
    age: 9,
    yearGroup: "Year 4",
    keyStageLevel: "KS2",
    curriculumPathway: "primary",
    weakPatterns: ["multiplication", "place value"],
    ...overrides,
  };
}

const noDuplicates = new Set<string>();

// ─── 1. Reviewed content with year mismatch + adminOverride=true → hardEligible ──

test("reviewed content can be assigned with admin override despite year mismatch", () => {
  const item = makeReviewedContent({ yearGroup: "Year 1", keyStage: undefined, metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 1" }) });
  const student = makeYear4Student();
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, true, "should be eligible with admin override");
  assert.ok(result.warningReason, "should have warning reason set");
  assert.ok(result.warningReason?.includes("override") || result.warningReason?.includes("mismatch") || result.warningReason?.includes("Placement"), "warning reason should reference mismatch");
});

// ─── 2. Reviewed content with KS mismatch + adminOverride=true → hardEligible ──

test("reviewed content can be assigned with admin override despite key stage mismatch", () => {
  const item = makeReviewedContent({
    yearGroup: null,
    keyStage: "KS1",
    metadataJson: JSON.stringify({ subject: "maths", keyStage: "KS1" }),
  });
  const student = makeYear4Student({ yearGroup: "Year 4", keyStageLevel: "KS2" });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, true, "should be eligible with admin override on key stage");
  assert.ok(result.warningReason, "warning reason should be set");
});

// ─── 3. Reviewed content with age mismatch + adminOverride=true → hardEligible ──

test("reviewed content can be assigned with admin override despite age mismatch", () => {
  // Content tagged for ages 5-7 (Year 1-2), student is age 9
  const item = makeReviewedContent({
    yearGroup: null,
    keyStage: null,
    metadataJson: JSON.stringify({ subject: "maths", ageGroup: "5-7" }),
  });
  const student = makeYear4Student({ age: 9, keyStageLevel: undefined, yearGroup: "Year 4" });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, true, "should be eligible with admin override on age mismatch");
});

// ─── 4. Draft content hard-blocked even with adminOverride=true ───────────────

test("draft content is hard-blocked even with adminOverride=true", () => {
  const item = makeReviewedContent({ status: "draft" });
  const student = makeYear4Student();
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, false, "draft content must remain hard-blocked regardless of adminOverride");
  assert.ok(result.hardBlockReason?.includes("Draft") || result.hardBlockReason?.includes("unreviewed"), "hardBlockReason should reference draft status");
  assert.equal(result.overrideEligible, undefined, "override should not apply to draft content");
});

// ─── 5. Generated content hard-blocked even with adminOverride=true ───────────

test("generated content is hard-blocked even with adminOverride=true", () => {
  const item = makeReviewedContent({ status: "generated" });
  const student = makeYear4Student();
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, false, "generated content must remain hard-blocked");
  assert.equal(result.overrideEligible, undefined, "override should not apply to generated content");
});

// ─── 6. Reviewed content assigned normally (no override needed) ───────────────

test("reviewed content with matching year assigns normally without override", () => {
  const item = makeReviewedContent({
    yearGroup: "Year 4",
    keyStage: "KS2",
    metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 4", keyStage: "KS2" }),
  });
  const student = makeYear4Student({ yearGroup: "Year 4", keyStageLevel: "KS2" });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, false);
  assert.equal(result.hardEligible, true, "matching year should be eligible without override");
  assert.equal(result.hardBlockReason, null, "no hard block reason for matching content");
});

// ─── 7. Bulk: multiple reviewed items to same student ─────────────────────────

test("bulk assign: multiple reviewed items produce separate eligible results for same student", () => {
  const student = makeYear4Student({ yearGroup: "Year 4", keyStageLevel: "KS2" });
  const items: ContentItem[] = [
    makeReviewedContent({ id: "c1", topic: "Place value", yearGroup: "Year 4", keyStage: "KS2", metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 4", keyStage: "KS2" }) }),
    makeReviewedContent({ id: "c2", topic: "Multiplication", yearGroup: "Year 4", keyStage: "KS2", metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 4", keyStage: "KS2" }) }),
    makeReviewedContent({ id: "c3", topic: "Fractions", yearGroup: "Year 4", keyStage: "KS2", metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 4", keyStage: "KS2" }) }),
  ];
  const results = items.map((item) => evaluateAssignmentCandidate(item, student, noDuplicates, false));
  assert.equal(results.every((r) => r.hardEligible), true, "all matching items should be eligible");
  assert.equal(results.length, 3, "should return one result per content item");
});

// ─── 8. Year mismatch without override → overrideEligible=true ───────────────

test("year mismatch without admin override returns overrideEligible=true and hardEligible=false", () => {
  const item = makeReviewedContent({ yearGroup: "Year 1", keyStage: undefined, metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 1" }) });
  const student = makeYear4Student();
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, false);
  assert.equal(result.hardEligible, false, "year mismatch without override must be hard-blocked");
  assert.equal(result.overrideEligible, true, "year mismatch should be override-eligible");
  assert.ok(result.overrideBlockReason, "overrideBlockReason should be set");
  assert.ok(result.overrideBlockReason?.includes("Year") || result.overrideBlockReason?.includes("mismatch"), "overrideBlockReason should describe mismatch");
});

// ─── 9. Key stage mismatch without override → overrideEligible=true ──────────

test("key stage mismatch without admin override returns overrideEligible=true", () => {
  const item = makeReviewedContent({
    yearGroup: null,
    keyStage: "KS1",
    metadataJson: JSON.stringify({ subject: "maths", keyStage: "KS1" }),
  });
  const student = makeYear4Student({ yearGroup: "Year 4", keyStageLevel: "KS2" });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, false);
  assert.equal(result.hardEligible, false, "ks mismatch should be hard-blocked without override");
  assert.equal(result.overrideEligible, true, "ks mismatch should be override-eligible");
  assert.ok(result.overrideBlockReason?.includes("stage") || result.overrideBlockReason?.includes("mismatch"), "overrideBlockReason should mention key stage");
});

// ─── 10. Age mismatch without override → overrideEligible=true ───────────────

test("age mismatch without admin override returns overrideEligible=true", () => {
  const item = makeReviewedContent({
    yearGroup: null,
    keyStage: null,
    metadataJson: JSON.stringify({ subject: "maths", ageGroup: "5-7" }),
  });
  const student = makeYear4Student({ age: 9, keyStageLevel: undefined, yearGroup: "Year 4" });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, false);
  assert.equal(result.hardEligible, false, "age mismatch should be hard-blocked without override");
  assert.equal(result.overrideEligible, true, "age mismatch should be override-eligible");
  assert.ok(result.overrideBlockReason, "overrideBlockReason should be set");
});

// ─── 11. School mismatch is never override-eligible ───────────────────────────

test("school mismatch is hard-blocked and NOT override-eligible", () => {
  const item = makeReviewedContent({
    yearGroup: "Year 4",
    keyStage: "KS2",
    metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 4", keyStage: "KS2", schoolId: "school-abc" }),
  });
  const student = makeYear4Student({ schoolIds: ["school-xyz"] });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, false, "school mismatch must remain hard-blocked even with adminOverride");
  assert.equal(result.overrideEligible, undefined, "school mismatch should not be override-eligible");
  assert.ok(result.hardBlockReason?.includes("School") || result.hardBlockReason?.includes("school"), "reason should mention school");
});

// ─── 12. Duplicate is hard-blocked with no overrideEligible ──────────────────

test("duplicate assignment is hard-blocked and NOT override-eligible", () => {
  const item = makeReviewedContent({ yearGroup: "Year 1", metadataJson: JSON.stringify({ subject: "maths" }) });
  const student = makeYear4Student();
  const duplicates = new Set([student.id]);
  const result = evaluateAssignmentCandidate(item, student, duplicates, true);
  assert.equal(result.hardEligible, false, "duplicate should remain hard-blocked");
  assert.equal(result.overrideEligible, undefined, "duplicate should not be override-eligible");
});

// ─── 13. Override lifts year mismatch: hardEligible=true ─────────────────────

test("adminOverride=true lifts year range mismatch to hardEligible=true with warningReason", () => {
  const item = makeReviewedContent({ yearGroup: "Year 1-2", metadataJson: JSON.stringify({ subject: "maths", yearGroup: "Year 1-2" }) });
  const student = makeYear4Student({ yearGroup: "Year 4", keyStageLevel: "KS2" });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, true, "override should lift year range mismatch");
  assert.ok(result.warningReason, "warningReason should be set");
});

// ─── 14. Override lifts KS mismatch: hardEligible=true ───────────────────────

test("adminOverride=true lifts key stage mismatch to hardEligible=true", () => {
  const item = makeReviewedContent({
    yearGroup: null,
    keyStage: "KS3",
    metadataJson: JSON.stringify({ subject: "maths", keyStage: "KS3" }),
  });
  const student = makeYear4Student({ yearGroup: "Year 4", keyStageLevel: "KS2" });
  const result = evaluateAssignmentCandidate(item, student, noDuplicates, true);
  assert.equal(result.hardEligible, true, "override should lift key stage mismatch");
  assert.ok(result.warningReason, "warning should be set for ks override");
});
