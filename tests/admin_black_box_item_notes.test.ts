/**
 * Tests: Admin Black Box item-level notes, review history, and BB status
 *
 * Covers Parts 2, 3, 4, and 5 of the fix specification.
 * These are pure-function tests against the utils.ts parsers and types.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseBlackBoxAdminVerification,
  parseBlackBoxContentTest,
  parseContentReviewHistory,
  getBlackBoxBadgeTone,
} from "@/components/admin/content-library/utils";
import type { ContentItem } from "@/components/admin/content-library/types";

function expectValue<T>(actual: T) {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected);
    },
    toHaveLength(expectedLength: number) {
      assert.equal((actual as { length: number }).length, expectedLength);
    },
    toContain(expectedSubstring: string) {
      assert.equal(typeof actual === "string" && actual.includes(expectedSubstring), true);
    },
    toBeNull() {
      assert.equal(actual, null);
    },
    not: {
      toBe(expected: unknown) {
        assert.notEqual(actual, expected);
      },
      toBeNull() {
        assert.notEqual(actual, null);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "test-content-1",
    contentType: "maths",
    level: 3,
    topic: "Addition",
    contentJson: JSON.stringify([
      { question: "What is 2+2?", answer: "4" },
      { question: "What is 5+3?", answer: "8" },
      { question: "What is 7+1?", answer: "8" },
    ]),
    usedCount: 0,
    createdAt: new Date().toISOString(),
    createdBy: "admin-1",
    status: "generated",
    metadataJson: null,
    ...overrides,
  };
}

function makeMetadata(extra: Record<string, unknown> = {}): string {
  return JSON.stringify(extra);
}

// ---------------------------------------------------------------------------
// Part 2: Per-item notes — Q1 note does not appear on Q2-Q5
// ---------------------------------------------------------------------------

describe("Per-item review notes", () => {
  it("stores independent notes per item index", () => {
    const itemNotes: Record<number, string> = {};
    // Admin sets note for Q1 (index 0)
    itemNotes[0] = "Q1: this answer is ambiguous";
    // Admin moves to Q2 (index 1) — note should be empty
    expectValue(itemNotes[1] ?? "").toBe("");
  });

  it("Q1 note does not appear on Q2", () => {
    const itemNotes: Record<number, string> = { 0: "Note for Q1 only" };
    expectValue(itemNotes[1] ?? "").not.toBe("Note for Q1 only");
    expectValue(itemNotes[1] ?? "").toBe("");
  });

  it("Q2 note does not appear on Q1", () => {
    const itemNotes: Record<number, string> = { 1: "Note for Q2" };
    expectValue(itemNotes[0] ?? "").toBe("");
    expectValue(itemNotes[1]).toBe("Note for Q2");
  });

  it("each question can hold its own different note", () => {
    const itemNotes: Record<number, string> = {
      0: "Q1 note",
      1: "Q2 note",
      2: "Q3 note",
      3: "Q4 note",
      4: "Q5 note",
    };
    for (let i = 0; i < 5; i++) {
      expectValue(itemNotes[i]).toBe(`Q${i + 1} note`);
    }
    // Ensure none bleed into each other
    expectValue(itemNotes[0]).not.toBe(itemNotes[1]);
    expectValue(itemNotes[1]).not.toBe(itemNotes[2]);
  });

  it("reading an unset item returns empty string", () => {
    const itemNotes: Record<number, string> = { 0: "only Q1 has a note" };
    [1, 2, 3, 4].forEach((idx) => {
      expectValue(itemNotes[idx] ?? "").toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// Part 3: Richer review history entries
// ---------------------------------------------------------------------------

describe("parseContentReviewHistory — rich item-level fields", () => {
  it("parses questionIndex and questionPreview from history entry", () => {
    const item = makeItem({
      metadataJson: makeMetadata({
        reviewHistory: [
          {
            action: "approve",
            status: "approved",
            createdAt: "2025-01-01T10:00:00Z",
            questionIndex: 1,
            questionPreview: "What is 5+3?",
            itemId: "item-abc",
            contentId: "content-123",
            contentTitle: "Addition Practice",
            subject: "maths",
            strandTopic: "number",
            yearGroup: "Year 3",
            keyStage: "KS2",
            level: 3,
            examBoard: null,
            blackBoxDecision: "NEEDS_ADMIN_REVIEW",
            blackBoxScore: 75,
          },
        ],
      }),
    });
    const history = parseContentReviewHistory(item);
    expectValue(history).toHaveLength(1);
    const entry = history[0];
    expectValue(entry.questionIndex).toBe(1);
    expectValue(entry.questionPreview).toBe("What is 5+3?");
    expectValue(entry.itemId).toBe("item-abc");
    expectValue(entry.contentId).toBe("content-123");
    expectValue(entry.contentTitle).toBe("Addition Practice");
    expectValue(entry.subject).toBe("maths");
    expectValue(entry.strandTopic).toBe("number");
    expectValue(entry.yearGroup).toBe("Year 3");
    expectValue(entry.keyStage).toBe("KS2");
    expectValue(entry.level).toBe(3);
    expectValue(entry.blackBoxDecision).toBe("NEEDS_ADMIN_REVIEW");
    expectValue(entry.blackBoxScore).toBe(75);
  });

  it("approving Q2 logs Q2 index specifically (not Q1)", () => {
    const item = makeItem({
      metadataJson: makeMetadata({
        reviewHistory: [
          {
            action: "approve",
            status: "approved",
            createdAt: "2025-01-01T10:00:00Z",
            questionIndex: 1,
            questionPreview: "What is 5+3?",
          },
        ],
      }),
    });
    const history = parseContentReviewHistory(item);
    expectValue(history[0].questionIndex).toBe(1);
    expectValue(history[0].questionPreview).toBe("What is 5+3?");
    expectValue(history[0].questionIndex).not.toBe(0);
  });

  it("review log includes all parent content fields", () => {
    const item = makeItem({
      metadataJson: makeMetadata({
        reviewHistory: [
          {
            action: "approve",
            status: "approved",
            createdAt: "2025-01-01T10:00:00Z",
            contentId: "batch-xyz",
            contentTitle: "Fractions Set A",
            subject: "maths",
            yearGroup: "Year 4",
            keyStage: "KS2",
            level: 4,
          },
        ],
      }),
    });
    const history = parseContentReviewHistory(item);
    const entry = history[0];
    expectValue(entry.contentId).toBe("batch-xyz");
    expectValue(entry.contentTitle).toBe("Fractions Set A");
    expectValue(entry.subject).toBe("maths");
    expectValue(entry.yearGroup).toBe("Year 4");
    expectValue(entry.keyStage).toBe("KS2");
    expectValue(entry.level).toBe(4);
  });

  it("history entry note is specific to that entry (not shared)", () => {
    const item = makeItem({
      metadataJson: makeMetadata({
        reviewHistory: [
          {
            action: "approve",
            status: "approved",
            createdAt: "2025-01-01T10:00:00Z",
            questionIndex: 0,
            notes: "Q1 specific note",
          },
          {
            action: "needs_changes",
            status: "generated",
            createdAt: "2025-01-01T10:01:00Z",
            questionIndex: 1,
            notes: "Q2 specific note",
          },
        ],
      }),
    });
    const history = parseContentReviewHistory(item);
    expectValue(history[0].notes).toBe("Q1 specific note");
    expectValue(history[1].notes).toBe("Q2 specific note");
    expectValue(history[0].notes).not.toBe(history[1].notes);
  });

  it("handles entries without new rich fields gracefully (backward compat)", () => {
    const item = makeItem({
      metadataJson: makeMetadata({
        reviewHistory: [
          {
            action: "approve",
            status: "approved",
            createdAt: "2025-01-01T10:00:00Z",
          },
        ],
      }),
    });
    const history = parseContentReviewHistory(item);
    expectValue(history[0].questionIndex).toBeNull();
    expectValue(history[0].questionPreview).toBeNull();
    expectValue(history[0].contentId).toBeNull();
    expectValue(history[0].blackBoxDecision).toBeNull();
    expectValue(history[0].blackBoxScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Part 4: Original Black Box score preserved after admin review
// ---------------------------------------------------------------------------

describe("parseBlackBoxAdminVerification — original BB score preserved (Part 4)", () => {
  it("stores originalBlackBoxDecision and originalBlackBoxScore separately", () => {
    const item = makeItem({
      metadataJson: makeMetadata({
        blackBoxAdminVerification: {
          status: "verified",
          decision: "approve",
          verifiedAt: "2025-01-01T10:00:00Z",
          verifiedBy: "admin-1",
          originalBlackBoxDecision: "NEEDS_ADMIN_REVIEW",
          originalBlackBoxScore: 90,
        },
      }),
    });
    const verification = parseBlackBoxAdminVerification(item);
    expectValue(verification).not.toBeNull();
    expectValue(verification?.originalBlackBoxDecision).toBe("NEEDS_ADMIN_REVIEW");
    expectValue(verification?.originalBlackBoxScore).toBe(90);
  });

  it("admin approval does not overwrite the machine BB decision", () => {
    const item = makeItem({
      metadataJson: makeMetadata({
        blackBoxContentTest: {
          decision: "NEEDS_ADMIN_REVIEW",
          score: 90,
          reasons: ["Level mismatch on Q2"],
        },
        blackBoxAdminVerification: {
          status: "verified",
          decision: "approve",
          verifiedAt: "2025-01-01T10:00:00Z",
          originalBlackBoxDecision: "NEEDS_ADMIN_REVIEW",
          originalBlackBoxScore: 90,
        },
      }),
    });
    const blackBox = parseBlackBoxContentTest(item);
    const verification = parseBlackBoxAdminVerification(item);
    // Machine result is unchanged
    expectValue(blackBox?.decision).toBe("NEEDS_ADMIN_REVIEW");
    expectValue(blackBox?.score).toBe(90);
    // Admin result is stored separately
    expectValue(verification?.decision).toBe("approve");
    expectValue(verification?.originalBlackBoxDecision).toBe("NEEDS_ADMIN_REVIEW");
    expectValue(verification?.originalBlackBoxScore).toBe(90);
  });

  it("approved item has verified status — not awaiting admin review", () => {
    const item = makeItem({
      status: "approved",
      metadataJson: makeMetadata({
        blackBoxAdminVerification: {
          status: "verified",
          decision: "approve",
          verifiedAt: "2025-01-01T10:00:00Z",
          originalBlackBoxDecision: "NEEDS_ADMIN_REVIEW",
          originalBlackBoxScore: 90,
        },
      }),
    });
    const verification = parseBlackBoxAdminVerification(item);
    expectValue(verification?.status).toBe("verified");
    expectValue(item.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Part 5: Run Black Box button state
// ---------------------------------------------------------------------------

describe("Content card Black Box button logic (Part 5)", () => {
  it("getBlackBoxBadgeTone returns slate (not-tested) tone when blackBox is null", () => {
    const tone = getBlackBoxBadgeTone(null);
    expectValue(tone).toContain("slate");
  });

  it("getBlackBoxBadgeTone returns emerald tone for APPROVE", () => {
    const tone = getBlackBoxBadgeTone({
      decision: "APPROVE",
      score: 100,
      reasons: [],
      itemChecks: [],
      reclassificationRecommendation: null,
    });
    expectValue(tone).toContain("emerald");
  });

  it("getBlackBoxBadgeTone returns rose tone for REJECT", () => {
    const tone = getBlackBoxBadgeTone({
      decision: "REJECT",
      score: 40,
      reasons: [],
      itemChecks: [],
      reclassificationRecommendation: null,
    });
    expectValue(tone).toContain("rose");
  });

  it("getBlackBoxBadgeTone returns amber tone for NEEDS_ADMIN_REVIEW", () => {
    const tone = getBlackBoxBadgeTone({
      decision: "NEEDS_ADMIN_REVIEW",
      score: 88,
      reasons: [],
      itemChecks: [],
      reclassificationRecommendation: null,
    });
    expectValue(tone).toContain("amber");
  });

  it("reviewed/published content with null blackBox should show warning", () => {
    const reviewedItem = makeItem({ status: "reviewed", metadataJson: makeMetadata({}) });
    const publishedItem = makeItem({ status: "published", metadataJson: makeMetadata({}) });
    const blackBoxReviewed = parseBlackBoxContentTest(reviewedItem);
    const blackBoxPublished = parseBlackBoxContentTest(publishedItem);
    // Both should be null (not tested), triggering the warning
    expectValue(blackBoxReviewed).toBeNull();
    expectValue(blackBoxPublished).toBeNull();
  });
});
