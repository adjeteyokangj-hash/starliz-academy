import test from "node:test";
import assert from "node:assert/strict";

import { logSensitiveAdminAction } from "../src/lib/audit/sensitive-admin-actions";

test("sensitive admin action is written to audit log with metadata", async () => {
  let captured: {
    actorUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    metadataJson?: string;
  } = {};

  const result = await logSensitiveAdminAction(
    {
      actorUserId: "admin-user-1",
      action: "REQUEST_DELETION",
      entityType: "student",
      entityId: "student-1",
      metadata: { approvalId: "approval-1", reason: "GDPR request" },
    },
    {
      createAuditLog: async (input) => {
        captured = input;
        return { id: "audit-123" };
      },
    },
  );

  assert.equal(result.id, "audit-123");
  assert.equal(captured.actorUserId, "admin-user-1");
  assert.equal(captured.action, "REQUEST_DELETION");
  assert.equal(captured.entityType, "student");
  assert.equal(captured.entityId, "student-1");

  const metadata = JSON.parse(captured.metadataJson ?? "{}") as { approvalId?: string; reason?: string };
  assert.equal(metadata.approvalId, "approval-1");
  assert.equal(metadata.reason, "GDPR request");
});
