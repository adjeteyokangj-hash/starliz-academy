import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { executeSource } from "../src/lib/coding/learning/source-execution";
import { executionResultSchema } from "../src/lib/coding/execution/client";
import type { executeCodingSource } from "../src/lib/coding/execution/client";
import type { Json } from "../src/lib/coding/learning/types";

const python = "python@sha256:b18b261e1b4974b4f321451ad5251ded85abb22c2b8b262da527dda1d031ab30";
const javascript = "sha256:4dda2383bfc88c245be66c59a6f7cebbdd593111c349d1f34c3e43ae179e3457";
const broker = "/mnt/c/Users/edwar/Documents/Projects/starliz-academy/scripts/coding/execute-local-test-job.mjs";

test("real runsc execution verifies teaching wrappers, persisted files, HTTP, SQLite and the DOM engine", {
  skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" ? "Requires the existing Ubuntu Docker/runsc engine; not a simulated isolation pass." : false,
  timeout: 180000,
}, async (suite) => {
  const runId = randomUUID(), path = `artifacts/coding-runner/source-${runId}.jsonl`;
  mkdirSync("artifacts/coding-runner", { recursive: true });
  writeFileSync(path, JSON.stringify({ runId, actualExecutionAttempt: true, runtime: "runsc", python, javascript }) + "\n", { flag: "wx" });
  const execute: typeof executeCodingSource = async (input) => {
    const image = input.language === "javascript" ? javascript : python;
    const job = { jobId: randomUUID(), language: input.language, source: input.source, stdin: input.stdin ?? "", timeLimitMs: input.timeLimitMs ?? 5000 };
    const result = await new Promise<unknown>((resolve, reject) => {
      const child = spawn("wsl", ["-d", "Ubuntu", "--exec", "/usr/bin/env", "CODING_RUNNER_CONTAINER_TESTS=1", "/usr/bin/node", broker], { windowsHide: true });
      let output = "", errors = "";
      const deadline = setTimeout(() => { child.kill(); reject(new Error("Local test transport exceeded its deadline.")); }, 30000);
      child.stdout.on("data", (chunk) => { output += String(chunk); });
      child.stderr.on("data", (chunk) => { errors += String(chunk); });
      child.once("error", (error) => { clearTimeout(deadline); reject(error); });
      child.once("close", (code) => {
        clearTimeout(deadline);
        if (code !== 0) return reject(new Error(errors || "Local isolation broker failed."));
        try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify({ job, image }));
    });
    const verified = executionResultSchema.parse(result);
    assert.equal(verified.jobId, job.jobId);
    assert.equal(verified.isolationRuntime, "runsc");
    assert.equal(verified.imageDigest, image.includes("@") ? image.split("@")[1] : image);
    appendFileSync(path, JSON.stringify({ sourceHash: createHash("sha256").update(input.source).digest("hex"), ...verified }) + "\n");
    return verified;
  };
  const record = (value: Json) => value as Record<string, Json>;
  const selected = new Set((process.env.CODING_SOURCE_CASES ?? "").split(",").filter(Boolean));
  const check = (name: string, verify: () => Promise<void>) => suite.test(name, { skip: selected.size > 0 && !selected.has(name) ? "Not selected for this targeted real-runtime verification" : false }, verify);
  await check("variable-trace", async () => {
  const variables = await executeSource({ type: "source", language: "python", entry: "variables", source: "score = score + 2\nprint(score)" }, { variables: { score: 3 } }, execute);
  assert.equal(variables.ok, true, variables.error);
  assert.equal(record(record(variables.output).variables!).score, 5);
  assert.ok(variables.trace.length >= 2);
  const written = await executeSource({ type: "source", language: "python", entry: "variables", source: "with open('notes.txt') as f: previous = f.read()\nwith open('notes.txt','w') as f: f.write(previous + ' seed')" }, { files: { "notes.txt": "fern" } }, execute);
  assert.equal(written.ok, true, written.error);
  assert.equal(record(record(written.output).files!)["notes.txt"], "fern seed");
  const resumed = await executeSource({ type: "source", language: "python", entry: "variables", source: "with open('notes.txt') as f: text = f.read()" }, { files: record(written.output).files! }, execute);
  assert.equal(resumed.ok, true, resumed.error);
  assert.equal(record(record(resumed.output).variables!).text, "fern seed");
  });

  await check("saved-files", async () => {
  const saved = await executeSource({ type: "source", language: "python", entry: "solve", source: "def solve(data):\n with open('garden.txt','w') as f: f.write('fern')\n return {'count': data['count'] + 1}" }, { count: 4 }, execute);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(record(record(saved.output).files!)["garden.txt"], "fern");
  const reopened = await executeSource({ type: "source", language: "python", entry: "solve", source: "def solve(data):\n with open('garden.txt') as f: return f.read()" }, { files: record(saved.output).files! }, execute);
  assert.equal(reopened.ok, true, reopened.error);
  assert.equal(record(reopened.output).result, "fern");
  });

  await check("local-http", async () => {
  const service = await executeSource({ type: "source", language: "python", entry: "handle", source: "def handle(request):\n return {'status': 200, 'body': {'message':'real local HTTP'}}" }, { requests: [{ method: "GET", path: "/plants" }] }, execute);
  assert.equal(service.ok, true, service.error);
  assert.deepEqual(record(service.output).result, { responses: [{ status: 200, body: { message: "real local HTTP" } }] });
  });

  await check("sqlite", async () => {
  const database = await executeSource({ type: "source", language: "sql", entry: "console", source: "SELECT COUNT(*) AS count FROM plant;" }, { setup: ["CREATE TABLE plant(name TEXT); INSERT INTO plant VALUES ('Fern'),('Rose');"] }, execute);
  assert.equal(database.ok, true, database.error);
  assert.deepEqual(record(database.output).results, [{ columns: ["count"], rows: [[2]] }]);
  });

  await check("dom-events", async () => {
  const dom = await executeSource({ type: "source", language: "javascript", entry: "dom", html: '<h1>Garden</h1><button id="grow">Grow</button><output id="count">0</output>', source: 'let count=0;document.getElementById("grow").addEventListener("click",()=>{document.getElementById("count").textContent=String(++count)});' }, { events: [{ type: "click", target: "grow" }, { type: "click", target: "grow" }] }, execute);
  assert.equal(dom.ok, true, dom.error);
  const domResult = record(record(dom.output).result!);
  assert.ok(Array.isArray(domResult.elements));
  assert.equal((domResult.elements as Array<Record<string, Json>>).find((element) => element.id === "count")?.text, "2");
  assert.equal(domResult.headingCount, 1);
  });
  await check("python-modules", async () => {
  const modularPython = await executeSource({ type: "source", language: "python", entry: "solve", source: "from garden_math import double\ndef solve(data): return double(data['count'])", projectFiles: { "garden_math.py": "def double(value): return value * 2" } }, { count: 7 }, execute);
  assert.equal(modularPython.ok, true, modularPython.error);
  assert.equal(record(modularPython.output).result, 14);
  });
  await check("commonjs-modules", async () => {
  const modularJavaScript = await executeSource({ type: "source", language: "javascript", entry: "solve", source: "const {triple}=require('./garden_math.js');function solve(data){return triple(data.count)}", projectFiles: { "garden_math.js": "exports.triple=value=>value*3;" } }, { count: 5 }, execute);
  assert.equal(modularJavaScript.ok, true, modularJavaScript.error);
  assert.equal(record(modularJavaScript.output).result, 15);
  });
  await check("broken-module", async () => {
  const brokenModule = await executeSource({ type: "source", language: "python", entry: "solve", source: "from garden_math import double\ndef solve(data): return double(data['count'])", projectFiles: { "garden_math.py": "def double(:" } }, { count: 7 }, execute);
  assert.equal(brokenModule.ok, false);
  assert.match(brokenModule.error ?? "", /SyntaxError/);
  });
  console.log(`Actual isolated source evidence: ${path}`);
});
