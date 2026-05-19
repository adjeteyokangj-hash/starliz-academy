import test from "node:test";
import assert from "node:assert/strict";

import { assessWarmupTranscript } from "../src/lib/warmup-response";

test("rejects incomplete warmup fragments", () => {
  const result = assessWarmupTranscript({ transcript: "I feel" });
  assert.equal(result.complete, false);
  assert.equal(result.reason, "incomplete_phrase");
});

test("rejects filler-only warmup responses", () => {
  const result = assessWarmupTranscript({ transcript: "um" });
  assert.equal(result.complete, false);
  assert.equal(result.reason, "filler");
});

test("accepts complete emotional warmup response", () => {
  const result = assessWarmupTranscript({ transcript: "I feel a bit nervous but ready to learn." });
  assert.equal(result.complete, true);
  assert.equal(result.reason, "valid");
});

test("rejects low confidence recognition", () => {
  const result = assessWarmupTranscript({ transcript: "I feel excited", confidence: 0.3 });
  assert.equal(result.complete, false);
  assert.equal(result.reason, "low_confidence");
});
