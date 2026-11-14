import test from "node:test";
import assert from "node:assert/strict";
import { readinessPlan, readinessPlans, bridgeWorkspaceKey, bridgeContext, verifiedBridgeSnapshot } from "../src/lib/coding/learning/readiness";
import { matchesBridgeWorkspace, bridgeContextSchema } from "../src/lib/coding/learning/bridge-context";
import { activityContentHash } from "../src/lib/coding/learning/catalogue";
import { artifactHash } from "../src/lib/coding/learning/state-machine";
import { ACTIVITY_VERSION } from "../src/lib/coding/learning/types";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { checkExecution } from "../src/lib/coding/learning/checks";
import { savedEvidenceSnapshot } from "../src/lib/coding/learning/saved-evidence-contract";

test("readiness uses the approved preceding projects and gives web evidence enough distinct earlier real creations", () => {
  assert.deepEqual(readinessPlans().map(plan => [plan.id, plan.entryYear, plan.benchmarks.length]), [["block-coding", 3, 4], ["blocks-to-text", 5, 4], ["programming-web", 7, 5], ["applied", 10, 4]]);
  for (const plan of readinessPlans()) { assert.equal(new Set(plan.benchmarks.map(activity => activity.id)).size, plan.benchmarks.length); assert.equal(plan.benchmarks.every(activity => activity.year < plan.entryYear), true); assert.equal(plan.benchmarks.filter(activity => activity.kind === "project").length, 4); }
  const web = readinessPlan("programming-web")!; assert.equal(web.benchmarks.at(-1)!.evidenceSlots, 2); assert.equal(web.benchmarks.slice(0, -1).length, 4);
  assert.equal(readinessPlan("arbitrary-lab"), null); assert.equal(bridgeContextSchema.safeParse({ ...bridgeContext(web), entryYear: 3 }).success, false);
});

test("bridge snapshot integrity requires actual matching work, independent checks and a sufficiently confident model-review record", async () => {
  const plan = readinessPlan("block-coding")!, activity = plan.benchmarks[0]!, execution = await executePractical(activity.workbench, activity.reference, activity.cases[0]!.input);
  assert.equal(execution.ok, true); const checks = checkExecution(execution, activity.cases[0]!.assertions); assert.equal(checks.every(check => check.passed), true);
  // Only the review record is a synthetic unit fixture. Actual provider review
  // and authenticated readiness awards have their own end-to-end evidence.
  const snapshot = { schema: 1, version: ACTIVITY_VERSION, activityId: activity.id, activityHash: activityContentHash(activity), artifact: activity.reference, artifactHash: artifactHash(activity.reference), input: activity.cases[0]!.input, files: {}, explanation: "Synthetic unit review record; the native practical execution above is real.", independent: true, execution, checks, explanationReview: { passed: true, source: "model", confidence: .9 }, placement: bridgeContext(plan) };
  assert.equal(verifiedBridgeSnapshot(plan, activity.id, JSON.stringify(snapshot)), true);
  for (const changed of [{ independent: false }, { artifactHash: "0".repeat(64) }, { activityHash: "0".repeat(64) }, { checks: [{ passed: false }] }, { execution: { ...execution, ok: false } }, { explanationReview: { passed: true, source: "evidence", confidence: 1 } }, { explanationReview: { passed: true, source: "model", confidence: .74 } }, { placement: { ...snapshot.placement, planHash: "0".repeat(64) } }]) assert.equal(verifiedBridgeSnapshot(plan, activity.id, JSON.stringify({ ...snapshot, ...changed })), false);
  assert.equal(matchesBridgeWorkspace(bridgeWorkspaceKey(plan, activity.id), activity.id, snapshot.placement), true);
  assert.equal(matchesBridgeWorkspace(bridgeWorkspaceKey(plan, activity.id), "a-different-activity", snapshot.placement), false);
  const saved = savedEvidenceSnapshot(JSON.stringify(snapshot), bridgeWorkspaceKey(plan, activity.id), "independent-mastery"); assert.ok(saved); assert.equal(saved.status, "practical-verified");
  assert.equal(savedEvidenceSnapshot(JSON.stringify({ ...snapshot, placement: { ...snapshot.placement, planId: "applied", entryYear: 10 } }), bridgeWorkspaceKey(plan, activity.id), "independent-mastery"), null);
});
