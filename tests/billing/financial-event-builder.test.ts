import test from "node:test";
import assert from "node:assert/strict";

import { buildFinancialEventPayload } from "../../src/lib/billing/financial-event-builder";

test("buildFinancialEventPayload creates VAT-aware event", () => {
  const payload = buildFinancialEventPayload({
    source: "subscription_webhook",
    sourceId: "evt_123",
    eventType: "subscription_payment_success",
    parentId: "parent_1",
    paymentProvider: "stripe",
    paymentReference: "pi_1",
    region: "UK",
    currency: "GBP",
    grossAmount: 120,
    vatEnabled: true,
    subscriptionPlan: "monthly",
  });

  assert.equal(payload.money.netAmount, 100);
  assert.equal(payload.money.vatAmount, 20);
  assert.equal(payload.paymentReference, "pi_1");
});
