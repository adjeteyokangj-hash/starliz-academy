import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";

import {
  handleParentDataRequestsGet,
  handleParentDataRequestsPost,
} from "../src/app/api/parent/data-requests/route";

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/parent/data-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("parent can create export data request for own child", async () => {
  let capturedAction = "";

  const response = await handleParentDataRequestsPost(
    makePostRequest({ type: "export", childId: "child-1" }),
    {
      requireSession: async () => ({
        session: { userId: "parent-1", email: "parent@example.com", role: "parent" },
        response: null,
      }),
      resolveParentScope: async () => ({ parentId: "parent-1", parentEmail: "parent@example.com", source: "session-user" }),
      findChildByParent: async () => ({ id: "child-1", name: "Ava" }),
      createAuditLog: async (input) => {
        capturedAction = input.action;
        return { id: "audit-1", createdAt: new Date("2026-06-01T00:00:00.000Z") };
      },
      listAuditLogs: async () => [],
    },
  );

  assert.equal(response.status, 201);
  assert.equal(capturedAction, "gdpr_export_request_created");
  const payload = (await response.json()) as { request?: { type?: string; childId?: string; status?: string } };
  assert.equal(payload.request?.type, "export");
  assert.equal(payload.request?.childId, "child-1");
  assert.equal(payload.request?.status, "requested");
});

test("parent cannot create export request for unrelated child", async () => {
  const response = await handleParentDataRequestsPost(
    makePostRequest({ type: "export", childId: "child-foreign" }),
    {
      requireSession: async () => ({
        session: { userId: "parent-1", email: "parent@example.com", role: "parent" },
        response: null,
      }),
      resolveParentScope: async () => ({ parentId: "parent-1", parentEmail: "parent@example.com", source: "session-user" }),
      findChildByParent: async () => null,
      createAuditLog: async () => ({ id: "audit-1", createdAt: new Date() }),
      listAuditLogs: async () => [],
    },
  );

  assert.equal(response.status, 404);
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, "Child not found.");
});

test("parent cannot create deletion request for unrelated child", async () => {
  const response = await handleParentDataRequestsPost(
    makePostRequest({ type: "deletion", childId: "child-foreign", reason: "Please erase." }),
    {
      requireSession: async () => ({
        session: { userId: "parent-1", email: "parent@example.com", role: "parent" },
        response: null,
      }),
      resolveParentScope: async () => ({ parentId: "parent-1", parentEmail: "parent@example.com", source: "session-user" }),
      findChildByParent: async () => null,
      createAuditLog: async () => ({ id: "audit-1", createdAt: new Date() }),
      listAuditLogs: async () => [],
    },
  );

  assert.equal(response.status, 404);
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, "Child not found.");
});

test("parent can list tracked data requests with ai disclosure", async () => {
  const response = await handleParentDataRequestsGet({
    requireSession: async () => ({
      session: { userId: "parent-1", email: "parent@example.com", role: "parent" },
      response: null,
    }),
    resolveParentScope: async () => ({ parentId: "parent-1", parentEmail: "parent@example.com", source: "session-user" }),
    findChildByParent: async () => null,
    createAuditLog: async () => ({ id: "audit-new", createdAt: new Date() }),
    listAuditLogs: async () => ([
      {
        id: "audit-2",
        action: "gdpr_deletion_request_created",
        entityId: "child-2",
        metadataJson: JSON.stringify({ childId: "child-2", childName: "Noah", reason: "Request removal" }),
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]),
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    requests?: Array<{ type?: string; status?: string; childName?: string }>;
    aiUseDisclosure?: { summary?: string; reviewStatus?: string };
  };
  assert.equal(payload.requests?.[0]?.type, "deletion");
  assert.equal(payload.requests?.[0]?.status, "requested");
  assert.equal(payload.requests?.[0]?.childName, "Noah");
  assert.ok(payload.aiUseDisclosure?.summary);
  assert.equal(payload.aiUseDisclosure?.reviewStatus, "legal_review_required");
});

test("anonymous parent data-request access is rejected", async () => {
  const response = await handleParentDataRequestsGet({
    requireSession: async () => ({
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }),
    resolveParentScope: async () => null,
    findChildByParent: async () => null,
    createAuditLog: async () => ({ id: "audit", createdAt: new Date() }),
    listAuditLogs: async () => [],
  });

  assert.equal(response.status, 401);
});
