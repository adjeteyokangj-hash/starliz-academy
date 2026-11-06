import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRunnerServer } from "../services/coding-runner/server.mjs";
import { executeCodingSource } from "../src/lib/coding/execution/client";
import type { ExecutionJob } from "../services/coding-runner/protocol.mjs";

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
const secret = "unit-test-private-runner-secret-not-for-deployment";
const image = `python@sha256:${"a".repeat(64)}`;

test("backend client verifies a signed result for the exact requested program job", async () => {
  const priorUrl = process.env.CODING_RUNNER_URL, priorSecret = process.env.CODING_RUNNER_SECRET;
  const server = createRunnerServer({ secret, pythonImage: image, javascriptImage: image,
    execute: async (job: ExecutionJob) => ({ jobId: job.jobId, language: job.language, stdout: "12\n", stderr: "", exitCode: 0, durationMs: 1, status: "completed", imageDigest: `sha256:${"a".repeat(64)}`, isolationRuntime: "runsc" }) });
  try {
    process.env.CODING_RUNNER_URL = await listen(server);
    process.env.CODING_RUNNER_SECRET = secret;
    const result = await executeCodingSource({ language: "python", source: "print(5 + 7)" });
    assert.equal(result.stdout, "12\n");
    assert.equal(result.status, "completed");
    await assert.rejects(executeCodingSource({ language: "python", source: "print(1)", expectedImageDigest: `sha256:${"b".repeat(64)}` }), /does not match/);
  } finally {
    if (priorUrl === undefined) delete process.env.CODING_RUNNER_URL; else process.env.CODING_RUNNER_URL = priorUrl;
    if (priorSecret === undefined) delete process.env.CODING_RUNNER_SECRET; else process.env.CODING_RUNNER_SECRET = priorSecret;
    await close(server);
  }
});

test("backend client rejects an unsigned result instead of grading it", async () => {
  const priorUrl = process.env.CODING_RUNNER_URL, priorSecret = process.env.CODING_RUNNER_SECRET;
  const server = createServer((_request, response) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ jobId: randomUUID(), status: "completed", stdout: "forged" })));
  try {
    process.env.CODING_RUNNER_URL = await listen(server);
    process.env.CODING_RUNNER_SECRET = secret;
    await assert.rejects(executeCodingSource({ language: "python", source: "print(1)" }), /failed verification/);
  } finally {
    if (priorUrl === undefined) delete process.env.CODING_RUNNER_URL; else process.env.CODING_RUNNER_URL = priorUrl;
    if (priorSecret === undefined) delete process.env.CODING_RUNNER_SECRET; else process.env.CODING_RUNNER_SECRET = priorSecret;
    await close(server);
  }
});

test("a configured remote runner cannot use plain HTTP", async () => {
  const priorUrl = process.env.CODING_RUNNER_URL, priorSecret = process.env.CODING_RUNNER_SECRET;
  try {
    process.env.CODING_RUNNER_URL = "http://runner.example.invalid";
    process.env.CODING_RUNNER_SECRET = secret;
    await assert.rejects(executeCodingSource({ language: "python", source: "print(1)" }), /requires HTTPS/);
  } finally {
    if (priorUrl === undefined) delete process.env.CODING_RUNNER_URL; else process.env.CODING_RUNNER_URL = priorUrl;
    if (priorSecret === undefined) delete process.env.CODING_RUNNER_SECRET; else process.env.CODING_RUNNER_SECRET = priorSecret;
  }
});
