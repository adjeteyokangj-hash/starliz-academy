import assert from "node:assert/strict";
import test from "node:test";

import { isFinalSmokeEnabled } from "../src/lib/release/final-smoke";

test("final smoke stays disabled by default", () => {
  assert.equal(isFinalSmokeEnabled(undefined), false);
  assert.equal(isFinalSmokeEnabled("0"), false);
  assert.equal(isFinalSmokeEnabled("false"), false);
});

test("final smoke only enables for explicit opt-in", () => {
  assert.equal(isFinalSmokeEnabled("1"), true);
  assert.equal(isFinalSmokeEnabled(" 1 "), true);
});