import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRunnerServer } from "../services/coding-runner/server.mjs";
import { containerArguments } from "../services/coding-runner/container.mjs";
import { authentic, pinnedImage, requestProof, responseProof, sign, validateJob } from "../services/coding-runner/protocol.mjs";

const secret = "unit-test-runner-secret-not-a-deployment-secret";
const image = `python@sha256:${"a".repeat(64)}`;
const job = () => ({ jobId: randomUUID(), language: "python", source: "print(2 + 3)", stdin: "", timeLimitMs: 1000 });

test("job schema rejects host controls, unsafe bounds and unsupported languages", () => {
  assert.ok(validateJob(job()));
  for (const input of [{ ...job(), mounts: ["/"] }, { ...job(), language: "shell" }, { ...job(), source: "x".repeat(65537) }, { ...job(), timeLimitMs: 0 }, { ...job(), stdin: "x".repeat(8193) }]) assert.equal(validateJob(input), null);
  assert.equal(pinnedImage("python:latest"), null);
  assert.equal(pinnedImage(image), image);
});

test("container invocation has explicit isolation and no host filesystem mount", () => {
  const args = containerArguments(job(), image);
  for (const flag of ["--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--pids-limit=32", "--ulimit=nproc=2:2", "--ulimit=nofile=128:128", "--memory=128m", "--memory-swap=128m", "--cpus=0.5", "--user=65534:65534", "--pull=never"]) assert.ok(args.includes(flag), flag);
  assert.ok(args.includes("--env=UV_THREADPOOL_SIZE=1"), "Asynchronous Node APIs stay inside the reviewed guest thread budget");
  assert.equal(args.some((arg) => arg === "-v" || arg.startsWith("--mount") || arg.startsWith("--volume")), false);
  assert.equal(args.includes("--privileged"), false);
  const javascript = containerArguments({ ...job(), language: "javascript", source: "console.log(1)" }, `node@sha256:${"b".repeat(64)}`);
  assert.equal(javascript[javascript.indexOf("--entrypoint") + 1], "node");
  assert.equal(javascript.includes("docker-entrypoint.sh"), false);
  assert.ok(javascript.includes("--ulimit=nproc=8:8"));
  assert.equal(javascript.at(-2), "-e");
});

test("request proof binds method, path, time, nonce and exact body", () => {
  const value = job();
  const timestamp = Date.now().toString();
  const body = JSON.stringify(value);
  const proof = requestProof("POST", "/execute", timestamp, value.jobId, body);
  const signature = sign(secret, proof);
  assert.equal(authentic(secret, proof, signature), true);
  assert.equal(authentic(secret, `${proof}changed`, signature), false);
  assert.equal(authentic(secret, proof, "bad"), false);
  assert.equal(authentic(secret, proof, "z".repeat(64)), false);
});

test("broker rejects unsigned, stale, replayed and overprivileged requests", async () => {
  let called = 0;
  const server = createRunnerServer({ secret, pythonImage: image, javascriptImage: image,
    execute: async (value) => { called++; return { jobId: value.jobId, language: value.language, stdout: "5\n", stderr: "", exitCode: 0, durationMs: 1, status: "completed" }; } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const send = async (value, timestamp = Date.now().toString(), signed = true) => {
    const body = JSON.stringify(value);
    return fetch(`${base}/execute`, { method: "POST", headers: {
      "Content-Type": "application/json", "X-Coding-Timestamp": timestamp,
      "X-Coding-Nonce": value.jobId, "X-Coding-Signature": signed ? sign(secret, requestProof("POST", "/execute", timestamp, value.jobId, body)) : "invalid",
    }, body });
  };
  try {
    assert.equal((await send(job(), undefined, false)).status, 401);
    assert.equal((await send(job(), String(Date.now() - 60_000))).status, 401);
    assert.equal((await send({ ...job(), privileged: true })).status, 400);
    const value = job();
    const response = await send(value);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(authentic(secret, responseProof(value.jobId, JSON.stringify(value), text), response.headers.get("x-coding-signature")), true);
    assert.equal((await send(value)).status, 409);
    assert.equal(called, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("completed uploads do not leave the five-second read timeout on bounded execution", async () => {
  const server = createRunnerServer({ secret, pythonImage: image, javascriptImage: image,
    execute: async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 5500));
      return { jobId: value.jobId, language: value.language, stdout: "prepared\n", stderr: "", exitCode: 0, durationMs: 5500, status: "completed" };
    } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = job(), body = JSON.stringify(value), timestamp = Date.now().toString();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/execute`, { method: "POST", body,
      headers: { "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": value.jobId,
        "X-Coding-Signature": sign(secret, requestProof("POST", "/execute", timestamp, value.jobId, body)) } });
    assert.equal(response.status, 200);
    const output = await response.text();
    assert.equal(authentic(secret, responseProof(value.jobId, body, output), response.headers.get("x-coding-signature")), true);
    assert.equal(JSON.parse(output).stdout, "prepared\n");
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
