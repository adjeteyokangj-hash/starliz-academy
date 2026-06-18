import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminContentReviewPost } from "../src/app/api/admin/content/[id]/review/route";

type ReviewDeps = NonNullable<Parameters<typeof handleAdminContentReviewPost>[2]>;

const request = new Request("http://localhost/api/admin/content/content-1/review", { method: "POST" });
const context = { params: Promise.resolve({ id: "content-1" }) };

function deps(overrides: Partial<ReviewDeps> = {}): ReviewDeps {
  return {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@starliz.test", role: "admin" },
      response: null,
    }),
    findContent: async () => ({
      id: "content-1",
      status: "generated",
      metadataJson: null,
      contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: "4" }]),
    }),
    findHistoricalContent: async () => [],
    updateContentToReviewed: async () => ({
      id: "content-1",
      status: "reviewed",
      reviewedAt: new Date("2026-06-11T10:00:00.000Z"),
    }),
    ...overrides,
  };
}

test("admin content review route requires admin access", async () => {
  const response = await handleAdminContentReviewPost(request, context, deps({
    requireAdmin: async () => ({
      session: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    }),
  }));

  assert.equal(response?.status, 401);
});

test("admin content review route blocks generated content without black box gate", async () => {
  let updated = false;

  const response = await handleAdminContentReviewPost(request, context, deps({
    updateContentToReviewed: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "reviewed",
        reviewedAt: new Date("2026-06-11T10:00:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { code?: string; error?: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "black_box_gate_required");
  assert.match(payload.error ?? "", /Black box live testing/i);
  assert.equal(updated, false);
});

test("admin content review route blocks stale black box metadata", async () => {
  let updated = false;

  const response = await handleAdminContentReviewPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "generated",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
        blackBoxNeedsRerun: true,
      }),
      contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: "4" }]),
    }),
    updateContentToReviewed: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "reviewed",
        reviewedAt: new Date("2026-06-11T10:00:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { code?: string; error?: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "black_box_gate_required");
  assert.match(payload.error ?? "", /Black box live testing/i);
  assert.equal(updated, false);
});

test("admin content review route allows review after black box pass and admin verification", async () => {
  let updated = false;

  const response = await handleAdminContentReviewPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "generated",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: "4" }]),
    }),
    updateContentToReviewed: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "reviewed",
        reviewedAt: new Date("2026-06-11T10:00:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { id?: string; status?: string; reviewedAt?: string };

  assert.equal(response.status, 200);
  assert.equal(payload.id, "content-1");
  assert.equal(payload.status, "reviewed");
  assert.equal(payload.reviewedAt, "2026-06-11T10:00:00.000Z");
  assert.equal(updated, true);
});

test("admin content review route keeps existing status protection", async () => {
  const response = await handleAdminContentReviewPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "published",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: "4" }]),
    }),
  }));

  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /does not need review/i);
});

test("admin content review route blocks when global duplicates exist", async () => {
  let updated = false;

  const response = await handleAdminContentReviewPost(request, context, deps({
    findContent: async () => ({
      id: "content-2",
      status: "generated",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentJson: JSON.stringify([
        { prompt: "What is 9 multiplied by 3?", answer: "27" },
      ]),
    }),
    findHistoricalContent: async () => [
      {
        id: "published-content-1",
        status: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 9 multiplied by 3?", answer: "27" },
        ]),
      },
    ],
    updateContentToReviewed: async () => {
      updated = true;
      return {
        id: "content-2",
        status: "reviewed",
        reviewedAt: new Date("2026-06-11T10:00:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { error?: string; duplicateMatches?: unknown[] };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /global duplicate/i);
  assert.ok(Array.isArray(payload.duplicateMatches));
  assert.equal(updated, false);
});

test("admin content review route allows review when no global duplicates exist", async () => {
  let updated = false;

  const response = await handleAdminContentReviewPost(request, context, deps({
    findContent: async () => ({
      id: "content-3",
      status: "generated",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentJson: JSON.stringify([
        { prompt: "What is the capital of France?", answer: "Paris" },
      ]),
    }),
    findHistoricalContent: async () => [
      {
        id: "old-content-1",
        status: "published",
        contentJson: JSON.stringify([
          { prompt: "What is the capital of Germany?", answer: "Berlin" },
        ]),
      },
    ],
    updateContentToReviewed: async () => {
      updated = true;
      return {
        id: "content-3",
        status: "reviewed",
        reviewedAt: new Date("2026-06-11T10:00:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { id?: string; status?: string };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "reviewed");
  assert.equal(updated, true);
});

test("admin content review route returns curriculum quality warnings from Black Box metadata", async () => {
  const response = await handleAdminContentReviewPost(request, context, deps({
    findContent: async () => ({
      id: "content-quality-warning",
      status: "generated",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
        blackBoxContentTest: {
          decision: "NEEDS_ADMIN_REVIEW",
          reasons: ["Item 1: Curriculum quality warning: shallow_maths_prompt"],
          itemChecks: [
            { reasons: ["Curriculum quality warning: vague_explanation"] },
          ],
        },
      }),
      contentJson: JSON.stringify([
        { prompt: "A shop has 18 pencils and sells 7. How many remain?", answer: "11" },
      ]),
    }),
  }));

  const payload = await response.json() as { status?: string; curriculumQualityWarnings?: string[] };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "reviewed");
  assert.ok(payload.curriculumQualityWarnings?.includes("Item 1: Curriculum quality warning: shallow_maths_prompt"));
  assert.ok(payload.curriculumQualityWarnings?.includes("Curriculum quality warning: vague_explanation"));
});
