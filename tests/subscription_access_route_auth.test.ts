import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";

import { handleSubscriptionAccessGet } from "../src/app/api/subscription/access/route";

function makeRequest(feature = "learning") {
  return new Request(`http://localhost/api/subscription/access?feature=${feature}`);
}

test("anonymous user cannot access paid subscription access API", async () => {
  const response = await handleSubscriptionAccessGet(makeRequest(), {
    requireSession: async () => ({
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }),
    resolveParentScope: async () => null,
    canUseFeature: async () => ({ allowed: false, upgradeRequired: true }),
  });

  assert.equal(response.status, 401);
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, "Unauthorized");
});

test("subscription access API denies expired parent feature access", async () => {
  const response = await handleSubscriptionAccessGet(makeRequest(), {
    requireSession: async () => ({
      session: { userId: "u1", email: "p@example.com", role: "parent" },
      response: null,
    }),
    resolveParentScope: async () => ({ parentId: "parent-1", parentEmail: "p@example.com", source: "session-user" }),
    canUseFeature: async () => ({
      allowed: false,
      reason: "EXPIRED",
      upgradeRequired: true,
      status: "expired",
    }),
  });

  assert.equal(response.status, 402);
  const payload = (await response.json()) as { reason?: string };
  assert.equal(payload.reason, "EXPIRED");
});

test("subscription access API allows active paid users", async () => {
  const response = await handleSubscriptionAccessGet(makeRequest(), {
    requireSession: async () => ({
      session: { userId: "u2", email: "paid@example.com", role: "parent" },
      response: null,
    }),
    resolveParentScope: async () => ({ parentId: "parent-2", parentEmail: "paid@example.com", source: "session-user" }),
    canUseFeature: async () => ({
      allowed: true,
      upgradeRequired: false,
      status: "active",
      planKey: "monthly",
      hasPaidSubscription: true,
    }),
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { allowed?: boolean };
  assert.equal(payload.allowed, true);
});
