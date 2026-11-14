import test from "node:test";
import assert from "node:assert/strict";
import { executeSource, ExecutionUnavailable } from "../src/lib/coding/learning/source-execution";
import type { executeCodingSource } from "../src/lib/coding/execution/client";
import { transportDiagnosticKind } from "../scripts/coding/stream-isolated-executor";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { functionDataActivities } from "../src/lib/coding/learning/content/functions-and-data";
import { initialActivityState, transitionActivity } from "../src/lib/coding/learning/state-machine";
import { executePractical } from "../src/lib/coding/learning/runtime";

test("startup diagnostics recognise null-separated Windows resource errors without returning host text", () => {
  assert.equal(transportDiagnosticKind("Insufficient system resources. Wsl/Service/CreateInstance/CreateVm/HCS/0x800705aa".split("").join("\0")), "system-resources");
  assert.equal(transportDiagnosticKind("Cannot find module /fictional/private/path"), "entrypoint");
  assert.equal(transportDiagnosticKind("Fictional unrelated message with private configuration text"), "unclassified");
});

test("learner payloads cannot replace native workbenches, program languages or verified entries", async () => {
  let invoked = false;
  const deps = { run: async () => { invoked = true; throw new Error("An invalid artifact must not reach execution"); }, teach: async () => ({ message: "Unused", source: "fallback" as const, revealing: false }), reflect: async () => ({ passed: false, message: "Unused", source: "evidence" as const, confidence: 0 }) };
  const native = firstRouteActivities[0]!, python = functionDataActivities[0]!;
  const nativeState = initialActivityState(native); nativeState.stage = "build"; nativeState.completed = ["discover", "predict"];
  const forged = { type: "source" as const, language: "python" as const, entry: "console" as const, source: "print('forged native result')" };
  await assert.rejects(() => transitionActivity(native, nativeState, { action: "run", stage: "build", revision: "test", artifact: forged }, deps), /own workspace and program language/);
  const pythonState = initialActivityState(python); pythonState.stage = "build"; pythonState.completed = ["discover", "predict"];
  assert.equal(python.reference.type, "source"); if (python.reference.type !== "source") throw new Error("Expected Python reference");
  const reference = python.reference;
  await assert.rejects(() => transitionActivity(python, pythonState, { action: "save", stage: "build", revision: "test", artifact: { ...reference, language: "javascript" } }, deps), /own workspace and program language/);
  await assert.rejects(() => transitionActivity(python, pythonState, { action: "run", stage: "build", revision: "test", artifact: { ...reference, entry: "console" } }, deps), /own workspace and program language/);
  assert.equal(invoked, false);
  nativeState.artifacts.build = forged;
  const recovered = await transitionActivity(native, nativeState, { action: "restore", stage: "build", revision: "test", artifact: forged }, deps);
  assert.deepEqual(recovered.state.artifacts.build, native.starter);
  assert.deepEqual(nativeState.artifacts.build, forged, "Recovery must not mutate or erase the original state");
});

test("web execution cannot bypass fresh DOM inspection through another entry mode", async () => {
  let invoked = false;
  const neverRun = async () => { invoked = true; throw new Error("Unsupported source must not reach a runner"); };
  const source = { type: "source" as const, language: "javascript" as const, entry: "solve" as const, source: "function solve(){return {headingCount:1}}" };
  assert.equal((await executePractical("web", source, {}, neverRun)).ok, false);
  assert.equal((await executePractical("route", source, {}, neverRun)).ok, false);
  assert.equal(invoked, false);
});

test("runner infrastructure status propagates as unavailable rather than a failed student assessment", async () => {
  const infrastructure: typeof executeCodingSource = async (input) => ({ jobId: "unit-contract-only", language: input.language, status: "infrastructure-error", stdout: "", stderr: "", exitCode: null, durationMs: 10, imageDigest: `sha256:${"a".repeat(64)}`, isolationRuntime: "runsc" });
  await assert.rejects(() => executeSource({ type: "source", language: "python", source: "print(1)" }, {}, infrastructure), ExecutionUnavailable);
});
test("internally constructed projects cannot bypass supporting-file path and size validation", async () => {
  let invoked = false;
  const forbidden: typeof executeCodingSource = async () => { invoked = true; throw new Error("This invalid project must not reach a runner"); };
  const escaped = await executeSource({ type: "source", language: "python", source: "print(1)", projectFiles: { "../outside.py": "print(2)" } }, {}, forbidden);
  assert.equal(escaped.ok, false);
  const oversized = await executeSource({ type: "source", language: "javascript", source: "console.log(1)", projectFiles: { "helper.js": "x".repeat(8193) } }, {}, forbidden);
  assert.equal(oversized.ok, false);
  assert.equal(invoked, false);
});

test("captured HTML and CSS remain saved text rather than being submitted for a second execution", async () => {
  const files = { "report.html": "<script>throw new Error('INERT_SAVED_SOURCE')</script><h1>Private report</h1>", "report.css": "body{color:#111}" };
  let calls = 0;
  const transport: typeof executeCodingSource = async input => {
    calls++;
    return { jobId: "unit-contract-only", language: input.language, status: "completed", stdout: "__STARLIZ_RESULT__" + JSON.stringify({ result: { count: 0 }, files }) + "\n", stderr: "", exitCode: 0, durationMs: 1, imageDigest: `sha256:${"a".repeat(64)}`, isolationRuntime: "runsc" };
  };
  const execution = await executeSource({ type: "source", language: "python", entry: "solve", source: "def solve(data): return {'count':0}" }, {}, transport);
  assert.equal(execution.ok, true); assert.equal(calls, 1, "Saved file text is not executed or promoted to a browser document");
  assert.deepEqual((execution.output as { files: unknown }).files, files);
});
