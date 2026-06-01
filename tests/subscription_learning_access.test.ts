import test from "node:test";
import assert from "node:assert/strict";

import { buildLearningAccessDeniedResponse, ensureLearningAccess } from "../src/lib/subscriptions/learning-access";

test("paid user access is allowed", async () => {
  const result = await ensureLearningAccess("parent-1", {
    getConsentState: async () => ({ acceptedAt: new Date("2026-01-01T00:00:00.000Z"), withdrawnAt: null }),
    canUseFeature: async () => ({
      allowed: true,
      upgradeRequired: false,
      status: "active",
      planKey: "monthly",
      hasPaidSubscription: true,
    }),
  });

  assert.equal(result.response, null);
  assert.equal(result.decision.allowed, true);
  assert.equal(result.decision.status, "active");
});

test("expired user is blocked", async () => {
  const result = await ensureLearningAccess("parent-2", {
    getConsentState: async () => ({ acceptedAt: new Date("2026-01-01T00:00:00.000Z"), withdrawnAt: null }),
    canUseFeature: async () => ({
      allowed: false,
      reason: "EXPIRED",
      upgradeRequired: true,
      status: "expired",
      hasPaidSubscription: false,
    }),
  });

  assert.ok(result.response);
  assert.equal(result.decision.reason, "EXPIRED");
  assert.equal(result.response?.status, 402);
});

test("cancelled subscription behaviour blocks when period ends", async () => {
  const response = buildLearningAccessDeniedResponse({
    allowed: false,
    reason: "CANCELLED",
    upgradeRequired: true,
    status: "cancelled",
  });

  assert.equal(response.status, 402);
  const payload = (await response.json()) as { code?: string };
  assert.equal(payload.code, "CANCELLED");
});

test("failed payment grace period can remain allowed", async () => {
  const result = await ensureLearningAccess("parent-3", {
    getConsentState: async () => ({ acceptedAt: new Date("2026-01-01T00:00:00.000Z"), withdrawnAt: null }),
    canUseFeature: async () => ({
      allowed: true,
      upgradeRequired: false,
      status: "past_due",
      trialSessionsUsed: 0,
      trialSessionsLeft: 3,
    }),
  });

  assert.equal(result.response, null);
  assert.equal(result.decision.status, "past_due");
  assert.equal(result.decision.allowed, true);
});

test("parent consent is required before learning access", async () => {
  const result = await ensureLearningAccess("parent-4", {
    getConsentState: async () => ({ acceptedAt: null, withdrawnAt: null }),
    canUseFeature: async () => ({
      allowed: true,
      upgradeRequired: false,
      status: "active",
    }),
  });

  assert.ok(result.response);
  assert.equal(result.response?.status, 403);
  assert.equal(result.decision.reason, "CONSENT_REQUIRED");
});
