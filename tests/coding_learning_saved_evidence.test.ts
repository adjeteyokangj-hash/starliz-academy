import test from "node:test";
import assert from "node:assert/strict";
import { savedEvidenceSnapshot } from "../src/lib/coding/learning/saved-evidence-contract";
import { artifactHash } from "../src/lib/coding/learning/state-machine";
import { ACTIVITY_VERSION } from "../src/lib/coding/learning/types";

test("frozen saved evidence distinguishes drafts from verified practical work without granting mastery", () => {
  const artifact = { type: "source" as const, language: "python" as const, source: "print(3)" }, hash = artifactHash(artifact);
  const snapshot = { schema: 1, version: ACTIVITY_VERSION, activityId: "fictional-unit-contract", activityHash: "a".repeat(64), artifact, artifactHash: hash, input: {}, files: {}, explanation: "", independent: false,
    checks: [{ description: "A unit fixture, not genuine learner mastery", passed: true }], execution: { ok: true, output: {}, trace: [], stdout: "3", stderr: "", runtime: "unit-only", steps: 1, sourceHash: hash } };
  const lessonId = `curriculum:${ACTIVITY_VERSION}:${snapshot.activityId}`;
  const parse = (value = snapshot, label = "verified-stage") => savedEvidenceSnapshot(JSON.stringify(value), lessonId, label);
  assert.equal(parse()?.status, "practical-verified");
  assert.equal(parse()?.independent, false, "Practical verification cannot manufacture independence");
  assert.equal(parse(snapshot, "saved-work")?.status, "saved-draft");
  assert.equal(parse({ ...snapshot, execution: { ...snapshot.execution, sourceHash: "b".repeat(64) } })?.status, "saved-draft");
  assert.equal(parse({ ...snapshot, execution: { ...snapshot.execution, sourceHash: "b".repeat(64) } })?.execution, null, "A stale result cannot be presented as the selected source's output");
  assert.equal(parse({ ...snapshot, checks: [{ description: "Still failing", passed: false }] })?.status, "saved-draft");
  assert.equal(parse({ ...snapshot, artifactHash: "b".repeat(64) }), null);
  assert.equal(savedEvidenceSnapshot(JSON.stringify(snapshot), "another-workspace", "verified-stage"), null);
  assert.equal(savedEvidenceSnapshot("{invalid", lessonId, "saved-work"), null);
});
