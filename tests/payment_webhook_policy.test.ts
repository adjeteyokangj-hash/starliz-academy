import assert from "node:assert/strict";
import test from "node:test";

import { isWebhookFallbackSignatureEnabledInRuntime } from "../src/lib/subscriptions/webhook-entry";

test("fallback signature policy defaults to disabled in production", () => {
  const result = isWebhookFallbackSignatureEnabledInRuntime({
    NODE_ENV: "production",
  });
  assert.equal(result, false);
});

test("fallback signature policy is enabled in production only when explicitly set", () => {
  const result = isWebhookFallbackSignatureEnabledInRuntime({
    NODE_ENV: "production",
    PAYMENT_WEBHOOK_ALLOW_FALLBACK_SIGNATURE: "true",
  });
  assert.equal(result, true);
});

test("fallback signature policy defaults to enabled outside production for local compatibility", () => {
  const result = isWebhookFallbackSignatureEnabledInRuntime({
    NODE_ENV: "development",
  });
  assert.equal(result, true);
});

test("fallback signature policy can be disabled outside production", () => {
  const result = isWebhookFallbackSignatureEnabledInRuntime({
    NODE_ENV: "development",
    PAYMENT_WEBHOOK_ALLOW_FALLBACK_SIGNATURE: "false",
  });
  assert.equal(result, false);
});
