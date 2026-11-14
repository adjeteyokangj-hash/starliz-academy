import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import { reapExpired } from "../services/coding-runner/reap-expired.mjs";
import { pinnedImage, sign, authentic, requestProof, responseProof } from "../services/coding-runner/protocol.mjs";

test("a crashed private broker leaves only its leased job, which is scoped-reaped before verified recovery", {
  skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" ? "Requires actual Linux Docker/runsc; not simulated crash recovery." : false,
  timeout: 100000,
}, async () => {
  assert.equal(process.platform, "linux");
  const python = pinnedImage(process.env.CODING_RUNNER_PYTHON_IMAGE), javascript = pinnedImage(process.env.CODING_RUNNER_JAVASCRIPT_IMAGE);
  assert.ok(python && javascript);
  const secret = randomBytes(32).toString("hex"), runId = randomUUID(), jobId = randomUUID(), jobName = `starliz-coding-${jobId}`;
  const evidence = `artifacts/coding-runner/crash-${runId}.jsonl`; fs.mkdirSync("artifacts/coding-runner", { recursive: true });
  fs.writeFileSync(evidence, JSON.stringify({ runId, jobId, actualExecutionAttempt: true, isolationRuntime: "runsc" }) + "\n", { flag: "wx" });
  const command = async (args) => (await promisify(execFile)("docker", args, { timeout: 3000, maxBuffer: 65536 })).stdout;
  const hosts = [];
  async function host() {
    const child = spawn(process.execPath, ["scripts/coding/crash-test-host.mjs"], { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, DOCKER_HOST: process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock" } });
    hosts.push(child);
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("The private test broker did not start")), 10000); let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; if (output.includes("\n")) { clearTimeout(timeout); try { resolve(JSON.parse(output.split("\n")[0]).port); } catch (error) { reject(error); } } });
      child.once("error", reject); child.once("exit", (code) => { clearTimeout(timeout); if (!output) reject(new Error(`Private broker exited ${code}`)); });
      child.stdin.write(JSON.stringify({ secret, python, javascript }) + "\n");
    });
    return { child, base: `http://127.0.0.1:${port}` };
  }
  async function send(base, job) {
    const body = JSON.stringify(job), timestamp = String(Date.now());
    const response = await fetch(`${base}/execute`, { method: "POST", body, signal: AbortSignal.timeout(45000), headers: { "Content-Type": "application/json", "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": job.jobId, "X-Coding-Signature": sign(secret, requestProof("POST", "/execute", timestamp, job.jobId, body)) } });
    const raw = await response.text();
    assert.equal(authentic(secret, responseProof(job.jobId, body, raw), response.headers.get("x-coding-signature")), true);
    return { status: response.status, result: JSON.parse(raw) };
  }
  let expires = 0, containerId;
  try {
    const initial = await host();
    const request = send(initial.base, { jobId, language: "javascript", source: "console.log('OWNED_CRASH_TEST_RUNNING');while(true){}", stdin: "", timeLimitMs: 5000 }).catch(() => null);
    const deadline = Date.now() + 18000; let executing = false;
    while (Date.now() < deadline) {
      try {
        const [container] = JSON.parse(await command(["inspect", jobName]));
        const logs = await command(["logs", "--tail", "4", jobName]);
        if (container.State.Running && logs.includes("OWNED_CRASH_TEST_RUNNING")) { containerId = container.Id; expires = Number(container.Config.Labels["starliz.coding.expires"]); executing = true; break; }
      } catch { /* Wait only for this test's exact newly generated job. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(executing, true, "Observe actual student-code execution before crashing our own broker");
    const exited = new Promise((resolve) => initial.child.once("exit", resolve)); initial.child.kill("SIGKILL"); await exited; await request;
    fs.appendFileSync(evidence, JSON.stringify({ ownBrokerKilled: true, exactOwnedContainer: containerId, expires }) + "\n");
    const early = await reapExpired({ jobIds: [jobId] }); assert.equal(early.removed.includes(containerId), false, "A valid lease is preserved");
    const remaining = expires - Date.now() + 100;
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    const cleaned = await reapExpired({ jobIds: [jobId] }); assert.deepEqual(cleaned.removed, [containerId]);
    const recovery = await host(), result = await send(recovery.base, { jobId: randomUUID(), language: "javascript", source: "console.log('RECOVERED_AFTER_CRASH')", stdin: "", timeLimitMs: 5000 });
    assert.equal(result.status, 200); assert.equal(result.result.status, "completed"); assert.equal(result.result.stdout, "RECOVERED_AFTER_CRASH\n");
    fs.appendFileSync(evidence, JSON.stringify({ expiredOwnedJobReaped: cleaned.removed, signedRecoveryResult: result.result, suitePassed: true }) + "\n");
  } finally {
    for (const child of hosts) if (child.exitCode === null && child.signalCode === null) child.stdin.end(JSON.stringify({ stop: true }) + "\n");
    if (containerId && expires && Date.now() > expires) await reapExpired({ jobIds: [jobId] });
  }
});
