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
    }),
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
    }),
  }));

  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /does not need review/i);
});