import test from "node:test";
import assert from "node:assert/strict";

import { handleDuplicateWebhookClaim } from "../src/lib/subscriptions/webhook-handler";

test("duplicate webhook claim is ignored and audited", async () => {
  let auditCalled = 0;
  let auditedEventId = "";

  const result = await handleDuplicateWebhookClaim({
    claimed: false,
    provider: "stripe",
    eventId: "evt_duplicate_1",
    eventType: "invoice.payment_succeeded",
    writeAuditLogFn: async (input) => {
      auditCalled += 1;
      auditedEventId = String(input.entityId ?? "");
    },
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.ignored, true);
  assert.equal(result?.reason, "DUPLICATE_EVENT");
  assert.equal(auditCalled, 1);
  assert.equal(auditedEventId, "evt_duplicate_1");
});

test("first webhook claim proceeds normally", async () => {
  let auditCalled = 0;

  const result = await handleDuplicateWebhookClaim({
    claimed: true,
    provider: "stripe",
    eventId: "evt_unique_1",
    eventType: "invoice.payment_succeeded",
    writeAuditLogFn: async () => {
      auditCalled += 1;
    },
  });

  assert.equal(result, null);
  assert.equal(auditCalled, 0);
});
