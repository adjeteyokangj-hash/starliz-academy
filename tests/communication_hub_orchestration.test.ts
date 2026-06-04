import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommunicationHubHealth,
  createCommunicationDraft,
  extractMentions,
  toCommunicationAuditOutput,
} from "../src/lib/notifications/communication-hub";

test("communication draft is always review-first and never auto-send", () => {
  const draft = createCommunicationDraft({
    subject: "Weekly catch-up summary",
    body: "@admin Please review the next steps before sending.",
    audience: "parent",
    channel: "inbox",
    actorUserId: "admin-1",
  });

  assert.equal(draft.boundary, "draft_review_required");
  assert.equal(draft.status, "draft");
  assert.equal(draft.allowAutoSend, false);
  assert.equal(draft.requiresHumanReview, true);
});

test("mentions are extracted consistently", () => {
  const mentions = extractMentions("Hi @admin and @dsl-team, please review @parent_123 note.");

  assert.deepEqual(mentions.map((mention) => mention.value), ["admin", "dsl-team", "parent_123"]);
});

test("critical safeguarding language escalates to safeguarding review", () => {
  const draft = createCommunicationDraft({
    subject: "Urgent",
    body: "Potential safeguarding issue with urgent risk indicators.",
    audience: "admin",
    channel: "internal_note",
    actorUserId: "admin-2",
    severity: "critical",
  });

  assert.equal(draft.escalation.level, "safeguarding_review");
});

test("audit output reflects escalation decision", () => {
  const draft = createCommunicationDraft({
    subject: "Mentioned follow-up",
    body: "@admin please check this parent message",
    audience: "parent",
    channel: "inbox",
    actorUserId: "admin-3",
    severity: "warning",
  });

  const audit = toCommunicationAuditOutput(draft);

  assert.equal(audit.action, "communication_escalation_flagged");
  assert.equal(audit.escalationLevel, "admin_review");
  assert.equal(audit.severity, "warning");
  assert.ok(audit.summary.toLowerCase().includes("draft"));
});

test("hub health returns informational for empty-state", () => {
  const health = buildCommunicationHubHealth({
    openThreads: 0,
    unreadInboundMessages: 0,
    pendingNotificationEvents: 0,
    failedNotificationDeliveries: 0,
    pendingEscalations: 0,
  });

  assert.equal(health.status, "informational");
  assert.equal(health.score, 100);
  assert.equal(health.boundary, "draft_review_required");
});

test("hub health returns warning when queues and escalations are high", () => {
  const health = buildCommunicationHubHealth({
    openThreads: 12,
    unreadInboundMessages: 10,
    pendingNotificationEvents: 24,
    failedNotificationDeliveries: 2,
    pendingEscalations: 1,
  });

  assert.equal(health.status, "warning");
  assert.ok(health.warnings.includes("inbound_backlog_high"));
  assert.ok(health.warnings.includes("notification_event_backlog_high"));
  assert.ok(health.warnings.includes("failed_deliveries_present"));
  assert.ok(health.warnings.includes("pending_escalations_present"));
});
