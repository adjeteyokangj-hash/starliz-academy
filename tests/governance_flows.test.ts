import assert from "node:assert/strict";
import test from "node:test";
import {
  canResolveIncident,
  evaluateCommunicationEligibility,
  evaluateSuspiciousLoginRisk,
} from "../src/lib/schools/governance_rules";

test("suspicious login risk flags repeated failures", () => {
  const result = evaluateSuspiciousLoginRisk({
    failureCount: 4,
    ipChanged: false,
    userAgentChanged: false,
  });

  assert.equal(result.suspicious, true);
  assert.equal(result.reason, "multiple_recent_failures");
});

test("suspicious login risk flags simultaneous network and device change", () => {
  const result = evaluateSuspiciousLoginRisk({
    failureCount: 0,
    ipChanged: true,
    userAgentChanged: true,
  });

  assert.equal(result.suspicious, true);
  assert.equal(result.reason, "new_device_and_network");
});

test("communication eligibility blocks opted-out parents", () => {
  const result = evaluateCommunicationEligibility({
    linkStatus: "active",
    canMessageTeachers: true,
    consentGivenAt: new Date().toISOString(),
    consentWithdrawnAt: null,
    optedOutAt: new Date().toISOString(),
    safeguardingLockedAt: null,
    hasOpenSafeguardingLock: false,
    safeguardingOverride: false,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "parent_opted_out");
});

test("communication eligibility blocks safeguarding locks without override", () => {
  const result = evaluateCommunicationEligibility({
    linkStatus: "active",
    canMessageTeachers: true,
    consentGivenAt: new Date().toISOString(),
    consentWithdrawnAt: null,
    optedOutAt: null,
    safeguardingLockedAt: new Date().toISOString(),
    hasOpenSafeguardingLock: true,
    safeguardingOverride: false,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "safeguarding_lock");
});

test("communication eligibility allows safeguarded messages with explicit override", () => {
  const result = evaluateCommunicationEligibility({
    linkStatus: "active",
    canMessageTeachers: true,
    consentGivenAt: new Date().toISOString(),
    consentWithdrawnAt: null,
    optedOutAt: null,
    safeguardingLockedAt: new Date().toISOString(),
    hasOpenSafeguardingLock: true,
    safeguardingOverride: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
});

test("incident resolution requires acknowledgement by resolver", () => {
  assert.equal(
    canResolveIncident({
      actorUserId: "resolver-1",
      acknowledgements: [{ userId: "resolver-1" }, { userId: "other-user" }],
    }),
    true,
  );

  assert.equal(
    canResolveIncident({
      actorUserId: "resolver-2",
      acknowledgements: [{ userId: "other-user" }],
    }),
    false,
  );
});
