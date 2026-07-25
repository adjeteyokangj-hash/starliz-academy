import test from "node:test";
import assert from "node:assert/strict";
import { canDo } from "../src/lib/schools/permissions";

test("viewHumanSupport is available to teacher and support roles", () => {
  assert.equal(canDo("teacher", "viewHumanSupport"), true);
  assert.equal(canDo("support", "viewHumanSupport"), true);
  assert.equal(canDo("owner", "viewHumanSupport"), true);
  assert.equal(canDo("staff_observer", "viewHumanSupport"), false);
  assert.equal(canDo("finance", "viewHumanSupport"), false);
});
