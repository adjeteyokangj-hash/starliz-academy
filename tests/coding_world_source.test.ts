import test from "node:test";
import assert from "node:assert/strict";
import { runWorldSource } from "../src/lib/coding/world/source";
import type { executeSource } from "../src/lib/coding/learning/source-execution";
const result = (actions: string[]) => ({ ok: true, output: { result: actions }, trace: [], stdout: "", stderr: "", runtime: "synthetic-source", steps: 0 });
test("written programs use the existing isolated source contract and both conditional fixtures", async () => {
  const fixtures: boolean[] = [];
  const execute: typeof executeSource = async (artifact, input) => {
    assert.equal(artifact.entry, "solve"); assert.equal(artifact.language, "python");
    const help = (input as { needsHelp: boolean }).needsHelp; fixtures.push(help);
    return result([help ? "assist" : "ready", ...Array.from({ length: 2 }, () => ["prepare", "top", "bake", "serve"]).flat()]);
  };
  assert.equal((await runWorldSource("pizza-decision", "python", "def solve(world): pass", execute)).ok, true);
  assert.deepEqual(fixtures, [true, false]);
});
test("source results are validated as data and cannot supply completion claims", async () => {
  const execute: typeof executeSource = async () => ({ ...result([]), output: { result: { completed: true } } });
  assert.equal((await runWorldSource("pizza-sequence", "javascript", "function solve(world){}", execute)).ok, false);
});
