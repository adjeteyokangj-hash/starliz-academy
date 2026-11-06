import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { authoredActivities, activityContentHash, validateReleaseSeal } from "../../src/lib/coding/learning/catalogue";
import { ACTIVITY_VERSION } from "../../src/lib/coding/learning/types";
import { curriculumRuntimeHash, practicalExecutionHash } from "./verify-curriculum-runtime";

// This command never connects to a database, model provider or execution host.
// It binds the user's content approval to unchanged practical evidence locally.
async function main() {
  assert(process.argv.includes("--apply-development-approval"), "Explicit local approval flag required");
  assert.equal(process.env.NODE_ENV, "development", "Local approval must run in development");
  const evidencePath = "docs/coding-curriculum/verification/rc-2026-11-03/activity-index.json";
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  assert.equal(authoredActivities.length, 440);
  assert.equal(evidence.activities.length, 440);
  assert.equal(new Set(evidence.activities.map((entry: { inventoryId: string }) => entry.inventoryId)).size, 440);
  const executionHash = await practicalExecutionHash();
  assert.equal(executionHash, evidence.practicalExecutionHash, "Executor or dependencies changed; review affected practical proofs first");
  for (const activity of authoredActivities) {
    const proof = evidence.activities.find((entry: { inventoryId: string }) => entry.inventoryId === activity.inventoryId);
    assert(proof?.passed && proof.checks > 0, `Missing practical proof: ${activity.inventoryId}`);
    assert.equal(activityContentHash(activity), proof.contentHash, `Content changed: ${activity.inventoryId}`);
  }
  const verificationRun = `docs/coding-curriculum/verification/local-approval-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  const runtimeHash = curriculumRuntimeHash();
  const seal = { version: ACTIVITY_VERSION, publicationScope: "development", runtimeHash, verificationRun, activities: Object.fromEntries(authoredActivities.map(activity => [activity.id, activityContentHash(activity)])) };
  assert(validateReleaseSeal(seal, runtimeHash));
  mkdirSync(verificationRun, { recursive: true });
  for (const name of ["release-manifest.json", "runtime-build.json"]) copyFileSync(resolve("src/lib/coding/learning", name), resolve(verificationRun, `previous-${name}`));
  const receipt = { approval: "approved all lessons curriculum content", scope: "local development only", approvedAt: new Date().toISOString(), activities: 440, coreLessons: 264, consolidations: 132, projects: 44, contentHashMatches: 440, practicalExecutionHash: executionHash, runtimeHash, preservedEvidence: evidencePath, preservedPracticalChecks: evidence.uniquePracticalChecks, practicalProgramsRerun: false, authenticatedPublicationAcceptance: "pending", productionReady: false, productionGates: ["ZDR", "runner security and hosting acceptance", "hosted permissions and private-media checks", "dependency advisories", "accessibility acceptance"] };
  writeFileSync(resolve(verificationRun, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  writeFileSync("src/lib/coding/learning/runtime-build.json", JSON.stringify({ runtimeHash, verificationRun }, null, 2) + "\n");
  writeFileSync("src/lib/coding/learning/release-manifest.json", JSON.stringify(seal, null, 2) + "\n");
  console.log(JSON.stringify({ ...receipt, verificationRun }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
