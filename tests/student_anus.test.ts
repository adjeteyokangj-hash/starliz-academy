import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveDecisionFor,
  canArchive,
  disposalEligibilityFor,
  hasAutomaticPurge,
  isAnusRetentionDeterministic,
  retentionPolicyFor,
} from "../src/lib/anus";

test("permanent records are retained and archive-eligible", () => {
  const policy = retentionPolicyFor("certificates");

  assert.equal(policy.category, "permanent");
  assert.equal(policy.retentionDays, null);
  assert.equal(policy.archiveEligible, true);
  assert.equal(policy.disposable, false);
  assert.equal(policy.automaticPurgeEnabled, false);
});

test("disposable records are temporary and regenerable", () => {
  const policy = retentionPolicyFor("cache");

  assert.equal(policy.category, "disposable");
  assert.equal(policy.archiveEligible, false);
  assert.equal(policy.disposable, true);
  assert.equal(policy.automaticPurgeEnabled, false);
});

test("archive decisions align with retention policy", () => {
  const permanentDecision = archiveDecisionFor("audit_records");
  const disposableDecision = archiveDecisionFor("generated_temporary_artifacts");

  assert.equal(permanentDecision.policy.archiveEligible, true);
  assert.equal(disposableDecision.policy.archiveEligible, false);
  assert.equal(canArchive("certificates"), true);
  assert.equal(canArchive("cache"), false);
});

test("disposal policy only marks temporary/disposable artifacts", () => {
  assert.equal(disposalEligibilityFor("cache").disposable, true);
  assert.equal(disposalEligibilityFor("certificates").disposable, false);
});

test("anus foundation has no automatic purge in this phase", () => {
  assert.equal(hasAutomaticPurge(), false);
});

test("retention decisions remain deterministic", () => {
  assert.equal(isAnusRetentionDeterministic(), true);
});
