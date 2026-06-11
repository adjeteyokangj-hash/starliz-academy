import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBlackBoxGateFailure,
  hasPassedBlackBoxGate,
  isBlackBoxGateTargetStatus,
  mergeBlackBoxGateMetadata,
  parseContentMetadataJson,
  resolveBlackBoxGatedSaveStatus,
} from "../src/lib/ai/content-black-box-gate";

test("black box gate parses missing or invalid metadata safely", () => {
  assert.deepEqual(parseContentMetadataJson(null), {});
  assert.deepEqual(parseContentMetadataJson(""), {});
  assert.deepEqual(parseContentMetadataJson("not-json"), {});
  assert.deepEqual(parseContentMetadataJson("[1,2,3]"), {});
});

test("black box gate only passes with live test passed and admin verification verified", () => {
  assert.equal(hasPassedBlackBoxGate({}), false);
  assert.equal(hasPassedBlackBoxGate({ blackBoxLiveTest: { status: "passed" } }), false);
  assert.equal(hasPassedBlackBoxGate({ blackBoxAdminVerification: { status: "verified" } }), false);

  assert.equal(
    hasPassedBlackBoxGate({
      blackBoxLiveTest: { status: "passed" },
      blackBoxAdminVerification: { status: "verified" },
    }),
    true,
  );
});

test("black box gate accepts metadata JSON string", () => {
  const metadataJson = JSON.stringify({
    blackBoxLiveTest: { status: "passed" },
    blackBoxAdminVerification: { status: "verified" },
  });

  assert.equal(hasPassedBlackBoxGate(metadataJson), true);
});

test("black box gate target statuses are review and publish statuses only", () => {
  assert.equal(isBlackBoxGateTargetStatus("generated"), false);
  assert.equal(isBlackBoxGateTargetStatus("rejected"), false);
  assert.equal(isBlackBoxGateTargetStatus("reviewed"), true);
  assert.equal(isBlackBoxGateTargetStatus("approved"), true);
  assert.equal(isBlackBoxGateTargetStatus("published"), true);
});

test("black box gate failure payload explains the required checks", () => {
  const failure = buildBlackBoxGateFailure();

  assert.equal(failure.code, "black_box_gate_required");
  assert.equal(failure.required.blackBoxLiveTest, "passed");
  assert.equal(failure.required.blackBoxAdminVerification, "verified");
  assert.match(failure.error, /Black box live testing/i);
});

test("black box gate metadata merge preserves existing metadata", () => {
  const merged = mergeBlackBoxGateMetadata(
    { source: "ai-generator", topic: "Tenses" },
    { blackBoxLiveTest: { status: "passed" } },
  );

  assert.equal(merged.source, "ai-generator");
  assert.equal(merged.topic, "Tenses");
  assert.deepEqual(merged.blackBoxLiveTest, { status: "passed" });
});

test("black box gate keeps generated saves from being auto-promoted", () => {
  assert.equal(resolveBlackBoxGatedSaveStatus("generated"), "generated");
  assert.equal(resolveBlackBoxGatedSaveStatus("rejected"), "rejected");
  assert.equal(resolveBlackBoxGatedSaveStatus("review"), "generated");
  assert.equal(resolveBlackBoxGatedSaveStatus("reviewed"), "generated");
  assert.equal(resolveBlackBoxGatedSaveStatus("approved"), "generated");
  assert.equal(resolveBlackBoxGatedSaveStatus("published"), "generated");
});
