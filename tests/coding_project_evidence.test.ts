import test from "node:test";
import assert from "node:assert/strict";
import { encodeMasteryProgram, readMasteryProgram } from "../src/lib/coding/project-evidence";
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
