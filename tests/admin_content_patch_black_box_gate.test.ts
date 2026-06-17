import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminContentPatch } from "../src/app/api/admin/content/[id]/route";

type PatchDeps = NonNullable<Parameters<typeof handleAdminContentPatch>[2]>;

const context = { params: Promise.resolve({ id: "content-1" }) };

function requestFor(body: unknown): Request {
  return new Request("http://localhost/api/admin/content/content-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function deps(overrides: Partial<PatchDeps> = {}): PatchDeps {
  return {
    requireAdmin: async () => ({
      session: { userId: "admin-1", email: "admin@starliz.test", role: "admin" },
      response: null,
    }),
    findContentForPatch: async () => ({
      id: "content-1",
      contentType: "math",
      contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: "4" }]),
      metadataJson: null,
    }),
    updateContent: async (_id, data) => ({
      id: "content-1",
      status: data.status ?? "generated",
    }),
    writeAuditLog: async () => undefined,
    ...overrides,
  };
}

test("admin content patch route requires admin access", async () => {
  const response = await handleAdminContentPatch(requestFor({ status: "reviewed" }), context, deps({
    requireAdmin: async () => ({
      session: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
    }),
  }));

  assert.equal(response?.status, 401);
});

test("admin content patch route blocks direct reviewed status without black box gate", async () => {
  let updated = false;

  const response = await handleAdminContentPatch(requestFor({ status: "reviewed" }), context, deps({
    updateContent: async (_id, data) => {
      updated = true;
      return { id: "content-1", status: data.status ?? "generated" };
    },
  }));

  const payload = await response.json() as { code?: string; error?: string };

  assert.equal(response.status, 409);
  assert.equal(payload.code, "black_box_gate_required");
  assert.match(payload.error ?? "", /Black box live testing/i);
  assert.equal(updated, false);
});

test("admin content patch route blocks direct approved and published status without black box gate", async () => {
  for (const status of ["approved", "published"] as const) {
    const response = await handleAdminContentPatch(requestFor({ status }), context, deps());
    const payload = await response.json() as { code?: string };

    assert.equal(response.status, 409);
    assert.equal(payload.code, "black_box_gate_required");
  }
});

test("admin content patch route allows generated and rejected status without black box gate", async () => {
  for (const status of ["generated", "rejected"] as const) {
    let updatedStatus = "";

    const response = await handleAdminContentPatch(requestFor({ status }), context, deps({
      updateContent: async (_id, data) => {
        updatedStatus = data.status ?? "";
        return { id: "content-1", status: data.status ?? "generated" };
      },
    }));

    const payload = await response.json() as { item?: { status?: string } };

    assert.equal(response.status, 200);
    assert.equal(payload.item?.status, status);
    assert.equal(updatedStatus, status);
  }
});

test("admin content patch route allows reviewed status after black box pass and admin verification", async () => {
  let audited = false;

  const response = await handleAdminContentPatch(requestFor({ status: "reviewed" }), context, deps({
    findContentForPatch: async () => ({
      id: "content-1",
      contentType: "math",
      contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: "4" }]),
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
    }),
    writeAuditLog: async () => {
      audited = true;
    },
  }));

  const payload = await response.json() as { item?: { id?: string; status?: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.item?.id, "content-1");
  assert.equal(payload.item?.status, "reviewed");
  assert.equal(audited, true);
});

test("admin content patch route still allows valid contentJson edit without black box gate", async () => {
  let contentUpdated = false;

  const response = await handleAdminContentPatch(
    requestFor({ contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: 4 }]) }),
    context,
    deps({
      updateContent: async (_id, data) => {
        contentUpdated = typeof data.contentJson === "string";
        return { id: "content-1", status: data.status ?? "generated" };
      },
    }),
  );

  const payload = await response.json() as { item?: { id?: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.item?.id, "content-1");
  assert.equal(contentUpdated, true);
});

test("admin content patch route marks black box stale when content changes", async () => {
  let updatedMetadataJson: string | undefined;

  const response = await handleAdminContentPatch(
    requestFor({ contentJson: JSON.stringify([{ prompt: "What is 3 + 3?", answer: 6 }]) }),
    context,
    deps({
      findContentForPatch: async () => ({
        id: "content-1",
        contentType: "math",
        contentJson: JSON.stringify([{ prompt: "What is 2 + 2?", answer: "4" }]),
        metadataJson: JSON.stringify({
          blackBoxLiveTest: { status: "passed" },
          blackBoxAdminVerification: { status: "verified" },
        }),
      }),
      updateContent: async (_id, data) => {
        updatedMetadataJson = data.metadataJson;
        return { id: "content-1", status: data.status ?? "generated" };
      },
    }),
  );

  const payload = await response.json() as { item?: { id?: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.item?.id, "content-1");
  assert.equal(typeof updatedMetadataJson, "string");
  const metadata = JSON.parse(updatedMetadataJson ?? "{}") as Record<string, unknown>;
  assert.equal((metadata.blackBoxLiveTest as { status?: string }).status, "needs_review");
  assert.equal((metadata.blackBoxAdminVerification as { status?: string }).status, "pending");
  assert.equal(metadata.blackBoxNeedsRerun, true);
});

test("admin content patch route allows published status when only near duplicate warnings exist", async () => {
  const response = await handleAdminContentPatch(requestFor({ status: "published" }), context, deps({
    findContentForPatch: async () => ({
      id: "content-1",
      contentType: "math",
      contentJson: JSON.stringify([
        { prompt: "A farmer packs 24 apples into 4 boxes. How many apples per box?", answer: "6" },
        { prompt: "A farmer shares 24 apples equally into 4 boxes. How many in each box?", answer: "6" },
      ]),
      metadataJson: JSON.stringify({
        blackBoxLiveTest: { status: "passed" },
        blackBoxAdminVerification: { status: "verified" },
      }),
    }),
  }));

  const payload = await response.json() as { item?: { status?: string } };

  assert.equal(response.status, 200);
  assert.equal(payload.item?.status, "published");
});