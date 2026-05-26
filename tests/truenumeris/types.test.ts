import test from "node:test";
import assert from "node:assert/strict";

import {
  trueNumerisEventRequestSchema,
  trueNumerisInvoiceRequestSchema,
  trueNumerisSettingsSchema,
} from "../../src/types/truenumeris";

test("truenumeris settings schema validates minimal payload", () => {
  const parsed = trueNumerisSettingsSchema.parse({
    enabled: true,
    region: "UK",
    autoInvoice: true,
    autoVat: true,
    autoReconciliation: true,
    syncFrequencyMinutes: 15,
  });

  assert.equal(parsed.region, "UK");
  assert.equal(parsed.enabled, true);
});

test("event request schema validates payload", () => {
  const parsed = trueNumerisEventRequestSchema.parse({
    idempotencyKey: "abc12345",
    event: {
      source: "subscription_webhook",
      eventType: "subscription_payment_success",
      region: "UK",
      money: {
        grossAmount: 120,
        vatAmount: 20,
        netAmount: 100,
        currency: "GBP",
      },
      metadata: {},
    },
  });

  assert.equal(parsed.event.money.netAmount, 100);
});

test("invoice request schema validates payload", () => {
  const parsed = trueNumerisInvoiceRequestSchema.parse({
    idempotencyKey: "invoice12345",
    invoiceNumber: "SL-UK-20260101-ABC123",
    grossAmount: 120,
    vatAmount: 20,
    netAmount: 100,
  });

  assert.equal(parsed.invoiceNumber.includes("SL-UK"), true);
});
