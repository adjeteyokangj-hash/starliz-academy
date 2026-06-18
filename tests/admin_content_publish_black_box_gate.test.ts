import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminContentPublishPost } from "../src/app/api/admin/content/[id]/publish/route";

type PublishDeps = NonNullable<Parameters<typeof handleAdminContentPublishPost>[2]>;

const request = new Request("http://localhost/api/admin/content/content-1/publish", { method: "POST" });
const context = { params: Promise.resolve({ id: "content-1" }) };

function deps(overrides: Partial<PublishDeps> = {}): PublishDeps {
  return {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@starliz.test", role: "admin" },
      response: null,
    }),
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: null,
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "2 + 2", answer: 4 },
      ]),
    }),
    findHistoricalContent: async () => [],
    updateContentToPublished: async () => ({
      id: "content-1",
      status: "published",
      publishedAt: new Date("2026-06-11T10:30:00.000Z"),
    }),
    ...overrides,
  };
}

test("admin content publish route requires admin access", async () => {
  const response = await handleAdminContentPublishPost(request, context, deps({
    requireAdmin: async () => ({
      session: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    }),
  }));

  assert.equal(response?.status, 401);
});

test("admin content publish route blocks reviewed content without black box gate", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { code?: string; error?: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "black_box_gate_required");
  assert.match(payload.error ?? "", /Black box live testing/i);
  assert.equal(updated, false);
});

test("admin content publish route blocks stale black box metadata", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
        blackBoxNeedsRerun: true,
      }),
      contentType: "math",
      contentJson: JSON.stringify([{ prompt: "2 + 2", answer: 4 }]),
    }),
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { code?: string; error?: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "black_box_gate_required");
  assert.match(payload.error ?? "", /Black box live testing/i);
  assert.equal(updated, false);
});

test("admin content publish route allows publish after black box pass and admin verification", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "2 + 2", answer: 4 },
      ]),
    }),
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { id?: string; status?: string; publishedAt?: string };

  assert.equal(response.status, 200);
  assert.equal(payload.id, "content-1");
  assert.equal(payload.status, "published");
  assert.equal(payload.publishedAt, "2026-06-11T10:30:00.000Z");
  assert.equal(updated, true);
});

test("admin content publish route keeps existing status protection", async () => {
  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "generated",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "2 + 2", answer: 4 },
      ]),
    }),
  }));

  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /Status must be "reviewed", "approved", or "published"/i);
});

test("admin content publish route blocks incomplete academic slots", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "2 + 2", answer: 4 },
        {},
      ]),
    }),
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 422);
  assert.equal(payload.error, "1 question slots still require content.");
  assert.equal(updated, false);
});

test("admin content publish route blocks exact duplicate questions", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "What is 18 divided by 3?", answer: "6" },
        { prompt: "What is 18 divided by 3?", answer: "6" },
      ]),
    }),
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /exact duplicate question pair/i);
  assert.equal(updated, false);
});

test("admin content publish route allows near duplicate warnings with successful publish", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "A farmer packs 24 apples into 4 boxes. How many apples per box?", answer: "6" },
        { prompt: "A farmer shares 24 apples equally into 4 boxes. How many in each box?", answer: "6" },
      ]),
    }),
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as {
    status?: string;
    duplicateWarnings?: Array<{ nearDuplicates?: number; samePatternDuplicates?: number }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "published");
  assert.equal(updated, true);
  assert.equal(Array.isArray(payload.duplicateWarnings), true);
  assert.equal((payload.duplicateWarnings ?? [])[0]?.nearDuplicates, 1);
});

test("admin content publish route blocks when global duplicates exist in historical content", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "What is 12 divided by 4?", answer: "3" },
        { prompt: "What is 15 plus 7?", answer: "22" },
      ]),
    }),
    findHistoricalContent: async () => [
      {
        id: "old-content-1",
        status: "published",
        contentJson: JSON.stringify([
          { prompt: "What is 12 divided by 4?", answer: "3" },
        ]),
      },
    ],
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { error?: string; duplicateMatches?: unknown[] };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /global duplicate/i);
  assert.ok(Array.isArray(payload.duplicateMatches), "duplicateMatches should be present");
  assert.equal(updated, false);
});

test("admin content publish route allows publish when historical questions are different", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-1",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "What is 8 plus 5?", answer: "13" },
        { prompt: "Solve: 7 times 3", answer: "21" },
      ]),
    }),
    findHistoricalContent: async () => [
      {
        id: "old-content-1",
        status: "published",
        contentJson: JSON.stringify([
          { prompt: "A baker has 48 cupcakes and sells 19. How many remain?", answer: "29" },
        ]),
      },
    ],
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-1",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { id?: string; status?: string };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "published");
  assert.equal(updated, true);
});

test("admin content publish route blocks near duplicate against published content", async () => {
  let updated = false;

  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-2",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "A baker uses 36 eggs to make 6 cakes. How many eggs per cake?", answer: "6" },
      ]),
    }),
    findHistoricalContent: async () => [
      {
        id: "published-content-1",
        status: "published",
        contentJson: JSON.stringify([
          { prompt: "A baker uses 36 eggs to bake 6 cakes. How many eggs does each cake need?", answer: "6" },
        ]),
      },
    ],
    updateContentToPublished: async () => {
      updated = true;
      return {
        id: "content-2",
        status: "published",
        publishedAt: new Date("2026-06-11T10:30:00.000Z"),
      };
    },
  }));

  const payload = await response.json() as { error?: string; duplicateMatches?: unknown[] };

  assert.equal(response.status, 422);
  assert.match(payload.error ?? "", /global duplicate/i);
  assert.equal(updated, false);
});

test("admin content publish route returns curriculum quality warnings from Black Box metadata", async () => {
  const response = await handleAdminContentPublishPost(request, context, deps({
    findContent: async () => ({
      id: "content-quality-warning",
      status: "reviewed",
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
        blackBoxContentTest: {
          decision: "NEEDS_ADMIN_REVIEW",
          reasons: ["Item 1: Curriculum quality warning: maths_reasoning_demand_weak"],
          itemChecks: [
            { reasons: ["Curriculum quality warning: answer_option_length_giveaway"] },
          ],
        },
      }),
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "A shop has 18 pencils and sells 7. How many remain?", answer: "11" },
      ]),
    }),
  }));

  const payload = await response.json() as { status?: string; curriculumQualityWarnings?: string[] };

  assert.equal(response.status, 200);
  assert.equal(payload.status, "published");
  assert.ok(payload.curriculumQualityWarnings?.includes("Item 1: Curriculum quality warning: maths_reasoning_demand_weak"));
  assert.ok(payload.curriculumQualityWarnings?.includes("Curriculum quality warning: answer_option_length_giveaway"));
});
