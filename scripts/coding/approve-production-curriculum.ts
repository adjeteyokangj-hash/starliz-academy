import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { authoredActivities, activityContentHash, validateReleaseSeal } from "../../src/lib/coding/learning/catalogue";
import { ACTIVITY_VERSION } from "../../src/lib/coding/learning/types";
import { curriculumRuntimeHash, practicalExecutionHash } from "./verify-curriculum-runtime";

// Production scope is a second approval. It requires the development seal for
// this exact runtime and a fresh evidence file whose practical hash matches
// the source being approved. It does not accept the preserved November index
// by default, and it does not edit a hash by hand.
async function main() {
  assert(process.argv.includes("--apply-production-approval"), "Explicit production approval flag required");
  assert.equal(process.env.NODE_ENV, "production", "Production approval must run with NODE_ENV=production");
  const evidenceArg = process.argv.find(argument => argument.startsWith("--evidence="));
  assert(evidenceArg, "Production approval requires --evidence from the fresh certification run");
  const evidencePath = evidenceArg.slice("--evidence=".length);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const executionHash = await practicalExecutionHash();
  const runtimeHash = curriculumRuntimeHash();
  assert.equal(executionHash, evidence.practicalExecutionHash, "Executor or dependencies changed; review affected practical proofs first");
  assert.equal(evidence.completePracticalCoverage, true);
  assert.equal(evidence.activities.length, 440);
  for (const activity of authoredActivities) {
    const proof = evidence.activities.find((entry: { inventoryId: string }) => entry.inventoryId === activity.inventoryId);
    assert(proof?.passed && proof.checks > 0, `Missing practical proof: ${activity.inventoryId}`);
    assert.equal(activityContentHash(activity), proof.contentHash, `Content changed: ${activity.inventoryId}`);
  }
  const current = JSON.parse(readFileSync("src/lib/coding/learning/release-manifest.json", "utf8"));
  const build = JSON.parse(readFileSync("src/lib/coding/learning/runtime-build.json", "utf8"));
  assert.equal(current.publicationScope, "development", "Production approval requires a distinct development seal for this runtime");
  assert.equal(current.runtimeHash, runtimeHash, "Development seal does not match the current runtime");
  assert.equal(build.runtimeHash, runtimeHash);
  assert.equal(build.verificationRun, current.verificationRun);
  const seal = { ...current, version: ACTIVITY_VERSION, publicationScope: "production", runtimeHash };
  assert(validateReleaseSeal(seal, runtimeHash));
  const verificationRun = `docs/coding-curriculum/verification/production-approval-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  mkdirSync(verificationRun, { recursive: true });
  for (const name of ["release-manifest.json", "runtime-build.json"]) copyFileSync(resolve("src/lib/coding/learning", name), resolve(verificationRun, `previous-${name}`));
  const receipt = { approval: "production curriculum publication", scope: "production", approvedAt: new Date().toISOString(), activities: 440, practicalExecutionHash: executionHash, runtimeHash, preservedEvidence: evidencePath, developmentVerificationRun: current.verificationRun, productionReady: true, externalGatesStillSeparate: ["ZDR", "hosted permissions and private-media checks", "dependency advisories", "accessibility acceptance"] };
  writeFileSync(resolve(verificationRun, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  writeFileSync("src/lib/coding/learning/runtime-build.json", JSON.stringify({ runtimeHash, verificationRun }, null, 2) + "\n");
  writeFileSync("src/lib/coding/learning/release-manifest.json", JSON.stringify({ ...seal, verificationRun }, null, 2) + "\n");
  console.log(JSON.stringify({ ...receipt, verificationRun }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Production approval failed"); process.exitCode = 1; });
