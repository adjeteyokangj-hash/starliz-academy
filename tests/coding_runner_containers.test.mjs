import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeContainer } from "../services/coding-runner/container.mjs";
import { createRunnerServer } from "../services/coding-runner/server.mjs";
import { authentic, pinnedImage, requestProof, responseProof, sign } from "../services/coding-runner/protocol.mjs";

test("real isolated interpreters, filesystem boundaries and execution budgets", {
  skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" ? "Requires a configured dedicated Docker/runsc test host and pinned images; not a simulated pass." : false,
  timeout: 120_000,
}, async () => {
  const python = pinnedImage(process.env.CODING_RUNNER_PYTHON_IMAGE);
  const javascript = pinnedImage(process.env.CODING_RUNNER_JAVASCRIPT_IMAGE);
  assert.ok(python, "Pin a reviewed Python image by digest");
  assert.ok(javascript, "Pin a reviewed JavaScript image by digest");
  const runtime = process.env.CODING_RUNNER_CONTAINER_TEST_RUNTIME || "runsc";
  assert.equal(process.platform, "linux", "Real-host evidence requires the Linux runner environment");
  assert.equal(runtime, "runsc", "Native runc tests cannot satisfy the reviewed production isolation requirement");
  const runId = randomUUID();
  fs.mkdirSync("artifacts/coding-runner", { recursive: true });
  const evidencePath = `artifacts/coding-runner/${runId}.jsonl`;
  fs.writeFileSync(evidencePath, `${JSON.stringify({ runId, actualExecutionAttempt: true, runtime, python, javascript, kernel: os.release(), node: process.version })}\n`, { flag: "wx" });
  const execute = async (language, source, stdin = "", timeLimitMs = 4000) => {
    const result = await executeContainer({ jobId: randomUUID(), language, source, stdin, timeLimitMs }, language === "javascript" ? javascript : python, "docker", runtime);
    fs.appendFileSync(evidencePath, `${JSON.stringify({ sourceHash: createHash("sha256").update(source).digest("hex"), ...result })}\n`);
    return result;
  };
  const first = await execute("python", "name = input()\nprint(name.upper())", "coding\n");
  assert.equal(first.status, "completed");
  assert.equal(first.stdout, "CODING\n");
  const second = await execute("javascript", "console.log(Number(input) + 7)", "5");
  assert.equal(second.status, "completed");
  assert.equal(second.stdout, "12\n");
  for (const [language, source] of [["python", "def broken(:"], ["javascript", "const value = ;"]]) {
    const result = await execute(language, source);
    assert.equal(result.status, "runtime-error", `${language} syntax errors must reach the actual interpreter`);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /SyntaxError/);
  }
  const sql = await execute("sql", "SELECT name FROM item WHERE quantity > 1 ORDER BY name;", JSON.stringify({ setup: ["CREATE TABLE item(name TEXT, quantity INTEGER); INSERT INTO item VALUES ('pen',3),('book',1);"] }));
  assert.equal(sql.status, "completed");
  assert.deepEqual(JSON.parse(sql.stdout), { results: [{ columns: ["name"], rows: [["pen"]] }] });
  const privacy = await execute("python", "import os\nprint(os.getenv('CODING_RUNNER_SECRET'))\nprint(os.getenv('DATABASE_URL'))\ntry:\n open('/coding-root-write','w')\n print('ROOT_WRITABLE')\nexcept OSError:\n print('ROOT_READ_ONLY')");
  assert.equal(privacy.status, "completed");
  assert.equal(privacy.stdout, "None\nNone\nROOT_READ_ONLY\n");
  const canaryPath = path.join(os.tmpdir(), `starliz-coding-canary-${randomUUID()}.txt`);
  const canary = randomBytes(32).toString("hex");
  fs.writeFileSync(canaryPath, canary);
  try {
    const boundary = await execute("python", `try:\n print(open(${JSON.stringify(canaryPath)}).read())\nexcept OSError:\n print('HOST_FILE_NOT_ACCESSIBLE')`);
    assert.equal(boundary.status, "completed");
    assert.equal(boundary.stdout, "HOST_FILE_NOT_ACCESSIBLE\n");
  } finally {
    // Only the exact fresh test canary is removed; never learner data.
    fs.unlinkSync(canaryPath);
  }
  const timed = await execute("python", "while True:\n pass", "", 1500);
  assert.equal(timed.status, "timeout", "A failed cleanup is infrastructure failure, not a passing timeout check");
  const javascriptTimed = await execute("javascript", "while (true) {}", "", 1500);
  assert.equal(javascriptTimed.status, "timeout");
  const memory = await execute("python", "a = bytearray(256 * 1024 * 1024)\nprint(len(a))");
  assert.equal(memory.status, "runtime-error", "Memory denial must be an interpreter/container exit, not an infrastructure error");
  assert.notEqual(memory.exitCode, 0);
  const javascriptMemory = await execute("javascript", "const values = []; while (true) values.push(new Array(100000).fill(12345));");
  assert.equal(javascriptMemory.status, "runtime-error");
  assert.notEqual(javascriptMemory.exitCode, 0);
  const network = await execute("python", "import socket\nfor address in ['1.1.1.1','169.254.169.254']:\n try:\n  socket.create_connection((address,80),timeout=0.3)\n  print('NETWORK_ACCESSIBLE')\n except OSError:\n  print('NETWORK_DENIED')");
  assert.equal(network.status, "completed");
  assert.equal(network.stdout, "NETWORK_DENIED\nNETWORK_DENIED\n");
  const javascriptBoundary = await execute("javascript", "const fs=require('node:fs'); console.log(process.env.DATABASE_URL === undefined && process.env.CODING_RUNNER_SECRET === undefined ? 'NO_APP_SECRETS' : 'SECRET_LEAK'); try { fs.writeFileSync('/coding-root-write','bad'); console.log('ROOT_WRITABLE'); } catch { console.log('ROOT_READ_ONLY'); } const net=require('node:net'); const s=net.connect({host:'1.1.1.1',port:80}); s.setTimeout(300); s.on('connect',()=>{ console.log('NETWORK_ACCESSIBLE');s.destroy(); }); s.on('error',()=>console.log('NETWORK_DENIED')); s.on('timeout',()=>{console.log('NETWORK_DENIED');s.destroy();});");
  assert.equal(javascriptBoundary.status, "completed");
  assert.equal(javascriptBoundary.stdout, "NO_APP_SECRETS\nROOT_READ_ONLY\nNETWORK_DENIED\n");
  const concurrent = await Promise.all([
    execute("python", "import time\ntime.sleep(0.2)\nprint('python-only')"),
    execute("javascript", "console.log('javascript-only')"),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status), ["completed", "completed"]);
  assert.deepEqual(concurrent.map((result) => result.stdout), ["python-only\n", "javascript-only\n"]);
  const output = await execute("python", "print('x' * 100000)");
  assert.equal(output.status, "output-limit");
  const secret = randomBytes(32).toString("hex");
  const broker = createRunnerServer({ secret, pythonImage: python, javascriptImage: javascript });
  await new Promise((resolve) => broker.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${broker.address().port}`;
  const send = async (value) => {
    const timestamp = Date.now().toString(), body = JSON.stringify(value);
    return fetch(`${base}/execute`, { method: "POST", body, headers: {
      "Content-Type": "application/json", "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": value.jobId,
      "X-Coding-Signature": sign(secret, requestProof("POST", "/execute", timestamp, value.jobId, body)),
    } });
  };
  try {
    const value = { jobId: randomUUID(), language: "python", source: "print(19 + 23)", stdin: "", timeLimitMs: 4000 };
    const response = await send(value), body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(authentic(secret, responseProof(value.jobId, JSON.stringify(value), body), response.headers.get("x-coding-signature")), true);
    assert.equal(JSON.parse(body).stdout, "42\n");
    assert.equal(JSON.parse(body).status, "completed");
    assert.equal((await send(value)).status, 409);
    fs.appendFileSync(evidencePath, `${JSON.stringify({ realBroker: true, signedResultVerified: true, replayRejected: true, result: JSON.parse(body) })}\n`);
    const pair = [
      { ...value, jobId: randomUUID(), source: "import time\ntime.sleep(0.75)\nprint('python-request')" },
      { ...value, jobId: randomUUID(), language: "javascript", source: "setTimeout(()=>console.log('javascript-request'),750)" },
    ];
    const requests = pair.map(send);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await send({ ...value, jobId: randomUUID() })).status, 503, "A third concurrent request must not bypass the host admission limit");
    const responses = await Promise.all(requests);
    for (const [index, response] of responses.entries()) {
      const resultBody = await response.text();
      assert.equal(response.status, 200);
      assert.equal(authentic(secret, responseProof(pair[index].jobId, JSON.stringify(pair[index]), resultBody), response.headers.get("x-coding-signature")), true);
      const result = JSON.parse(resultBody);
      assert.equal(result.status, "completed");
      assert.equal(result.stdout, index === 0 ? "python-request\n" : "javascript-request\n");
      fs.appendFileSync(evidencePath, `${JSON.stringify({ concurrentHttpRequest: true, ...result })}\n`);
    }
  } finally {
    broker.closeAllConnections();
    await new Promise((resolve) => broker.close(resolve));
  }
  fs.appendFileSync(evidencePath, `${JSON.stringify({ runId, suitePassed: true })}\n`);
});
