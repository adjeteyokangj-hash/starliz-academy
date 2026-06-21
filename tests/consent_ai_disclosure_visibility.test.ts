import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";

import { handleConsentGet } from "../src/lib/consent-api";

test("consent API includes AI disclosure for parent visibility", async () => {
  const response = await handleConsentGet({
    requireSession: async () => ({
      session: { userId: "parent-1", email: "parent@example.com", role: "parent" },
      response: null,
    }),
    getUserConsent: async () => ({
      consentVersion: "1.0",
      consentAcceptedAt: new Date("2026-05-01T00:00:00.000Z"),
      consentWithdrawnAt: null,
    }),
    getConsentHistory: async () => [],
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    accepted?: boolean;
    aiDisclosure?: {
      summary?: string;
      reviewStatus?: string;
      policyLinks?: { privacy?: string; terms?: string };
    };
  };

  assert.equal(payload.accepted, true);
  assert.ok(payload.aiDisclosure?.summary);
  assert.equal(payload.aiDisclosure?.reviewStatus, "legal_review_required");
  assert.equal(payload.aiDisclosure?.policyLinks?.privacy, "/privacy");
  assert.equal(payload.aiDisclosure?.policyLinks?.terms, "/terms");
});

test("anonymous caller cannot fetch consent disclosure", async () => {
  const response = await handleConsentGet({
    requireSession: async () => ({
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }),
    getUserConsent: async () => null,
    getConsentHistory: async () => [],
  });

  assert.equal(response.status, 401);
});
