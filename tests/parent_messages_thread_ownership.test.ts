import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

import { handleParentMessagesGet } from "../src/app/api/parent/messages/route";

function makeGet(threadId?: string) {
  const url = threadId
    ? `http://localhost/api/parent/messages?threadId=${encodeURIComponent(threadId)}`
    : "http://localhost/api/parent/messages";
  return new NextRequest(url);
}

test("parent messages GET returns 404 and audits foreign threadId", async () => {
  let auditedAction = "";
  const response = await handleParentMessagesGet(makeGet("thread-foreign"), {
    requireSession: async () => ({
      session: { userId: "parent-1", email: "a@example.com", role: "parent" },
      response: null,
    }),
    resolveParentScope: async () => ({
      parentId: "parent-1",
      parentEmail: "a@example.com",
      source: "session-user",
    }),
    listThreads: async () => [
      {
        id: "thread-own",
        channel: "text",
        contactAddress: "a@example.com",
        contactLabel: "A",
        unreadCount: 0,
        parentUnreadCount: 0,
        lastMessageAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
    clearParentUnread: async () => undefined,
    listLatestMessages: async () => [],
    listThreadMessages: async () => {
      throw new Error("must not load foreign thread messages");
    },
    writeAuditLog: async (input) => {
      auditedAction = input.action;
      return { id: "audit-1", createdAt: new Date() };
    },
  });

  assert.equal(response.status, 404);
  assert.equal(auditedAction, "message_access_denied");
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, "Thread not found.");
});

test("parent messages GET loads owned thread messages only", async () => {
  const response = await handleParentMessagesGet(makeGet("thread-own"), {
    requireSession: async () => ({
      session: { userId: "parent-1", email: "a@example.com", role: "parent" },
      response: null,
    }),
    resolveParentScope: async () => ({
      parentId: "parent-1",
      parentEmail: "a@example.com",
      source: "session-user",
    }),
    listThreads: async () => [
      {
        id: "thread-own",
        channel: "text",
        contactAddress: "a@example.com",
        contactLabel: "A",
        unreadCount: 0,
        parentUnreadCount: 1,
        lastMessageAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
    clearParentUnread: async () => undefined,
    listLatestMessages: async () => [
      { threadId: "thread-own", body: "Hello", direction: "inbound" },
    ],
    listThreadMessages: async () => [
      {
        id: "msg-1",
        direction: "inbound",
        body: "Hello",
        actorUserId: "parent-1",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
    writeAuditLog: async () => ({ id: "audit-1", createdAt: new Date() }),
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    selectedThreadId?: string;
    messages?: Array<{ id: string }>;
  };
  assert.equal(payload.selectedThreadId, "thread-own");
  assert.equal(payload.messages?.length, 1);
});

test("unauthenticated parent messages GET returns session response", async () => {
  const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await handleParentMessagesGet(makeGet("thread-any"), {
    requireSession: async () => ({ session: null, response: denied }),
    resolveParentScope: async () => null,
    listThreads: async () => [],
    clearParentUnread: async () => undefined,
    listLatestMessages: async () => [],
    listThreadMessages: async () => [],
    writeAuditLog: async () => ({ id: "audit-1", createdAt: new Date() }),
  });
  assert.equal(response.status, 401);
});
