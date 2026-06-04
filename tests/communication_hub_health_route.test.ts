import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminCommunicationHubHealthGet,
  type AdminCommunicationHubHealthPayload,
} from "../src/app/api/admin/messages/hub-health/route";
import type { CommunicationHubHealthCounts } from "../src/lib/notifications/communication-hub";

test("communication hub health route requires admin access", async () => {
  const response = await handleAdminCommunicationHubHealthGet(
    new Request("http://localhost/api/admin/messages/hub-health"),
    {
      requireAdmin: async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
      }),
      collectCounts: async () => ({
        openThreads: 0,
        unreadInboundMessages: 0,
        pendingNotificationEvents: 0,
        failedNotificationDeliveries: 0,
        pendingEscalations: 0,
      }),
    },
  );

  assert.equal(response?.status, 401);
});

test("communication hub health route returns informational safe-state", async () => {
  const counts: CommunicationHubHealthCounts = {
    openThreads: 0,
    unreadInboundMessages: 0,
    pendingNotificationEvents: 0,
    failedNotificationDeliveries: 0,
    pendingEscalations: 0,
  };

  const response = await handleAdminCommunicationHubHealthGet(
    new Request("http://localhost/api/admin/messages/hub-health"),
    {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
    },
  );

  const payload = await response.json() as AdminCommunicationHubHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "informational");
  assert.equal(payload.score, 100);
  assert.equal(payload.boundary, "draft_review_required");
});

test("communication hub health route warns on backlogs and failed delivery", async () => {
  const counts: CommunicationHubHealthCounts = {
    openThreads: 14,
    unreadInboundMessages: 9,
    pendingNotificationEvents: 30,
    failedNotificationDeliveries: 3,
    pendingEscalations: 2,
  };

  const response = await handleAdminCommunicationHubHealthGet(
    new Request("http://localhost/api/admin/messages/hub-health"),
    {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
    },
  );

  const payload = await response.json() as AdminCommunicationHubHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "warning");
  assert.ok(payload.warnings.includes("notification_event_backlog_high"));
  assert.ok(payload.warnings.includes("failed_deliveries_present"));
  assert.equal(payload.boundary, "draft_review_required");
});
