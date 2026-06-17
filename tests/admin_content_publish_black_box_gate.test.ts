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
