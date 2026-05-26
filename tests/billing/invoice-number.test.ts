import test from "node:test";
import assert from "node:assert/strict";

import { buildIdempotencyKey, buildInvoicePrefix, generateInvoiceNumber } from "../../src/lib/billing/invoice-number";

test("buildInvoicePrefix supports UK and GH", () => {
  assert.equal(buildInvoicePrefix("UK"), "SL-UK");
  assert.equal(buildInvoicePrefix("GH"), "SL-GH");
});

test("generateInvoiceNumber includes prefix and date", () => {
  const now = new Date("2026-05-26T12:00:00Z");
  const invoice = generateInvoiceNumber({ region: "UK", now, paymentReference: "pi_123" });
  assert.equal(invoice.startsWith("SL-UK-20260526-"), true);
});

test("buildIdempotencyKey is deterministic for same inputs", () => {
  const keyA = buildIdempotencyKey(["stripe", "pi_123", "invoice.payment_succeeded"]);
  const keyB = buildIdempotencyKey(["stripe", "pi_123", "invoice.payment_succeeded"]);
  assert.equal(keyA, keyB);
});
