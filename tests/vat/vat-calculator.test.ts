import test from "node:test";
import assert from "node:assert/strict";

import { calculateVat, resolveVatRate } from "../../src/lib/billing/vat-calculator";

test("resolveVatRate returns UK rate", () => {
  assert.equal(resolveVatRate("UK"), 0.2);
  assert.equal(resolveVatRate("GB"), 0.2);
});

test("resolveVatRate returns 0 for Ghana in phase 1", () => {
  assert.equal(resolveVatRate("GH"), 0);
});

test("calculateVat computes UK VAT split", () => {
  const vat = calculateVat({ grossAmount: 120, country: "UK", currency: "GBP", vatEnabled: true });
  assert.equal(vat.netAmount, 100);
  assert.equal(vat.vatAmount, 20);
  assert.equal(vat.grossAmount, 120);
});

test("calculateVat returns zero VAT when disabled", () => {
  const vat = calculateVat({ grossAmount: 80, country: "UK", currency: "GBP", vatEnabled: false });
  assert.equal(vat.netAmount, 80);
  assert.equal(vat.vatAmount, 0);
});
