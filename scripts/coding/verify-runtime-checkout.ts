import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import release from "../../src/lib/coding/learning/release-manifest.json";
import { curriculumRuntimeHash, practicalExecutionHash, practicalInputFiles, runtimeInputFiles, verifyCurriculumRuntime } from "./verify-curriculum-runtime";

type CheckoutEvidence = { runtimeHash: string; practicalHash: string; files: Array<{ path: string; sha256: string }> };

async function main() {
  // Always check the actual checkout against its approved seal first. This tool
  // neither normalizes input bytes nor substitutes committed blobs for files.
  verifyCurriculumRuntime();
  const runtimeHash = curriculumRuntimeHash();
  const practicalHash = await practicalExecutionHash();
  const receiptDirectory = release.verificationRun;
  assert(receiptDirectory.startsWith("docs/coding-curriculum/verification/local-approval-"));
  const receipt = JSON.parse(readFileSync(resolve(receiptDirectory, "receipt.json"), "utf8"));
  assert.equal(receipt.productionReady, false);
  assert.equal(receipt.scope, "local development only");
  assert.equal(receipt.practicalExecutionHash, practicalHash, "Practical evidence cannot be reused for a different executor");
  const files = [...new Set([...runtimeInputFiles(), ...await practicalInputFiles()])].map(file => ({ path: relative(process.cwd(), file).replaceAll("\\", "/"), sha256: createHash("sha256").update(readFileSync(file)).digest("hex") })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const actual: CheckoutEvidence = { runtimeHash, practicalHash, files };
  const manifest = resolve(receiptDirectory, "runtime-inputs.json");
  if (process.argv.includes("--record-development-checkout")) {
    assert.equal(process.env.NODE_ENV, "development");
    writeFileSync(manifest, JSON.stringify(actual, null, 2) + "\n", { flag: "wx" });
    console.log(`Recorded ${files.length} actual input hashes alongside the approved development receipt.`);
  } else {
    const expected: CheckoutEvidence = JSON.parse(readFileSync(manifest, "utf8"));
    assert.deepEqual(actual, expected, "Checkout bytes or practical executor do not match the development evidence");
    console.log(JSON.stringify({ platform: process.platform, inputs: files.length, runtimeHash, practicalHash, productionReady: false }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
