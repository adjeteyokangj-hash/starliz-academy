import test from "node:test";
import assert from "node:assert/strict";
import { encodeMasteryProgram, readMasteryProgram, restoredReviewProject } from "../src/lib/coding/project-evidence";
import { runCodingProgram } from "../src/lib/coding/runner";
import type { CodingProgram } from "../src/lib/coding/types";

const program: CodingProgram = { blocks: [{ id: "right", kind: "move", direction: "right" }] };
test("parent mastery replay uses the assessed target even after a fresh challenge changes it", () => {
  const stored = encodeMasteryProgram(program, { x: 1, y: 0 });
  const evidence = readMasteryProgram(stored)!;
  assert.equal(runCodingProgram(evidence.program, evidence.goal).reachedGoal, true);
  assert.equal(runCodingProgram(evidence.program, { x: 3, y: 0 }).reachedGoal, false);
  assert.deepEqual(evidence.program, program);
});
test("legacy snapshots retain their program without inventing assessment metadata", () => {
  assert.deepEqual(readMasteryProgram(JSON.stringify(program)), { program, goal: null });
  assert.equal(readMasteryProgram("invalid"), null);
  assert.equal(readMasteryProgram('{"blocks":null}'), null);
  const invalid = JSON.stringify({ ...program, assessment: { version: 1, goal: { x: 99, y: 0 } } });
  assert.equal(readMasteryProgram(invalid)?.goal, null);
});

test("Review restores assessed frames and original target instead of an edited working copy", () => {
  const assessed = readMasteryProgram(encodeMasteryProgram(program, { x: 1, y: 0 }))!;
  const edited: CodingProgram = { blocks: [{ id: "edited", kind: "move", direction: "up" }] };
  const restored = restoredReviewProject(edited, { x: 0, y: 1 }, assessed)!;
  assert.deepEqual(restored.program, program);
  assert.deepEqual(restored.run.frames, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  assert.equal(restored.run.reachedGoal, true);
  assert.deepEqual(edited.blocks, [{ id: "edited", kind: "move", direction: "up" }]);
});

test("Review supports saved Create work but never invents a legacy snapshot's destination", () => {
  assert.equal(restoredReviewProject(program, { x: 1, y: 0 })?.run.reachedGoal, true);
  assert.equal(restoredReviewProject(program, { x: 1, y: 0 }, readMasteryProgram(JSON.stringify(program)))?.run.reachedGoal, false);
  assert.equal(restoredReviewProject({ blocks: [] }, null), null);
});
