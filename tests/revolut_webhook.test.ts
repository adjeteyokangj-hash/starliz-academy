import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"

import { verifyRevolutSignature } from "../src/lib/subscriptions/webhook-entry"
import { resolveRevolutWebhookStatus } from "../src/lib/subscriptions/webhook-status"

test("Revolut signature verification accepts a valid payload", () => {
  const secret = "revolut-test-secret"
  const rawBody = '{"event":"ORDER_COMPLETED","order_id":"order_123","merchant_order_ext_ref":"parent_1"}'
  const timestamp = String(Date.now())
  const digest = createHmac("sha256", secret).update(`v1.${timestamp}.${rawBody}`).digest("hex")

  const previousSecret = process.env.REVOLUT_WEBHOOK_SECRET
  process.env.REVOLUT_WEBHOOK_SECRET = secret

  try {
    const result = verifyRevolutSignature(rawBody, `v1=${digest}`, timestamp)
    assert.equal(result.ok, true)
  } finally {
    process.env.REVOLUT_WEBHOOK_SECRET = previousSecret
  }
})

test("Revolut signature verification rejects stale timestamps", () => {
  const secret = "revolut-test-secret"
  const rawBody = '{"event":"ORDER_COMPLETED","order_id":"order_123"}'
  const timestamp = String(Date.now() - 10 * 60 * 1000)
  const digest = createHmac("sha256", secret).update(`v1.${timestamp}.${rawBody}`).digest("hex")

  const previousSecret = process.env.REVOLUT_WEBHOOK_SECRET
  process.env.REVOLUT_WEBHOOK_SECRET = secret

  try {
    const result = verifyRevolutSignature(rawBody, `v1=${digest}`, timestamp)
    assert.equal(result.ok, false)
  } finally {
    process.env.REVOLUT_WEBHOOK_SECRET = previousSecret
  }
})

test("Revolut order events map to subscription statuses", () => {
  assert.equal(resolveRevolutWebhookStatus({ eventType: "ORDER_COMPLETED" }), "active")
  assert.equal(resolveRevolutWebhookStatus({ eventType: "ORDER_AUTHORISED" }), "pending")
  assert.equal(resolveRevolutWebhookStatus({ eventType: "ORDER_PAYMENT_FAILED" }), "past_due")
  assert.equal(resolveRevolutWebhookStatus({ eventType: "ORDER_PAYMENT_DECLINED", existingStatus: "cancelled" }), "cancelled")
})