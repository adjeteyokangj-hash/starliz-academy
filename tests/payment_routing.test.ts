import test from "node:test"
import assert from "node:assert/strict"

import {
  getPaymentAvailabilityMessage,
  isProviderAvailableForCountry,
  resolveBillingRegion,
  resolveCurrencyForCountry,
  resolvePaymentProvider,
} from "../src/lib/billing/payment-routing"

test("GB resolves to UK region, GBP, and revolut", () => {
  const region = resolveBillingRegion("GB")
  assert.equal(region.countryCode, "UK")
  assert.equal(resolveCurrencyForCountry("GB"), "GBP")
  assert.equal(resolvePaymentProvider("GB"), "revolut")
})

test("UK resolves to GBP and revolut", () => {
  assert.equal(resolveCurrencyForCountry("UK"), "GBP")
  assert.equal(resolvePaymentProvider("UK"), "revolut")
})

test("United Kingdom resolves to GBP and revolut", () => {
  assert.equal(resolveCurrencyForCountry("United Kingdom"), "GBP")
  assert.equal(resolvePaymentProvider("United Kingdom"), "revolut")
})

test("GH resolves to GHS and paystack", () => {
  assert.equal(resolveCurrencyForCountry("GH"), "GHS")
  assert.equal(resolvePaymentProvider("GH"), "paystack")
})

test("Ghana resolves to GHS and paystack", () => {
  assert.equal(resolveCurrencyForCountry("Ghana"), "GHS")
  assert.equal(resolvePaymentProvider("Ghana"), "paystack")
})

test("NG resolves to NGN and paystack", () => {
  assert.equal(resolveCurrencyForCountry("NG"), "NGN")
  assert.equal(resolvePaymentProvider("NG"), "paystack")
})

test("Nigeria resolves to NGN and paystack", () => {
  assert.equal(resolveCurrencyForCountry("Nigeria"), "NGN")
  assert.equal(resolvePaymentProvider("Nigeria"), "paystack")
})

test("unsupported country resolves to manual fallback semantics", () => {
  const region = resolveBillingRegion("unknown-country")
  assert.equal(region.countryCode, "UNSUPPORTED")
  assert.equal(resolvePaymentProvider("unknown-country"), "manual")
  assert.equal(isProviderAvailableForCountry("manual", "unknown-country"), true)
  assert.equal(isProviderAvailableForCountry("revolut", "unknown-country"), false)
})

test("ghana and nigeria payment availability message is safe", () => {
  const messageGhana = getPaymentAvailabilityMessage("ghana")
  const messageNigeria = getPaymentAvailabilityMessage("nigeria")
  assert.ok(messageGhana.includes("not yet accepting payments"))
  assert.ok(messageNigeria.includes("not yet accepting payments"))
})

test("stripe remains inactive by default", () => {
  assert.equal(isProviderAvailableForCountry("stripe", "UK"), false)
})
