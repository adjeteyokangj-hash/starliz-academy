import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { streamIsolatedExecutor } from "../scripts/coding/stream-isolated-executor";

test("the warm private test pipe still uses separate pinned gVisor containers for each program", { skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" }, async () => {
  const runId = randomUUID(), directory = `artifacts/coding-runner/stream-${runId}`;
  mkdirSync(directory, { recursive: true });
  const evidence = `${directory}/actual-jobs.jsonl`;
  writeFileSync(evidence, "", { flag: "wx" });
  const execute = streamIsolatedExecutor(evidence);
  try {
    const first = await execute({ language: "python", source: "from pathlib import Path\nPath('/tmp/stream-check.txt').write_text('fictional state')\nprint(6 + 7)", timeLimitMs: 5000 });
    assert.equal(first.status, "completed", first.stderr); assert.equal(first.stdout.trim(), "13"); assert.equal(first.isolationRuntime, "runsc");
    const second = await execute({ language: "python", source: "from pathlib import Path\nprint(Path('/tmp/stream-check.txt').exists())", timeLimitMs: 5000 });
    assert.equal(second.status, "completed", second.stderr); assert.equal(second.stdout.trim(), "False"); assert.notEqual(second.jobId, first.jobId);
    const javascript = await execute({ language: "javascript", source: "console.log(JSON.parse(input).value * 3)", stdin: '{"value":7}', timeLimitMs: 5000 });
    assert.equal(javascript.status, "completed", javascript.stderr); assert.equal(javascript.stdout.trim(), "21"); assert.equal(javascript.isolationRuntime, "runsc");
    writeFileSync(`${directory}/result.json`, JSON.stringify({ runId, actualJobs: 3, passed: true, privateTestPipeOnly: true, isolatedFilesystemBetweenJobs: true, languages: ["python", "javascript"], productionGatewayAuthenticationClaim: false }, null, 2), { flag: "wx" });
  } finally { await execute.close(); }
});

test("trusted DOM startup is ready before student code and the five-second loop deadline remains enforced", { skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" }, async () => {
  const runId = randomUUID(), directory = `artifacts/coding-runner/bootstrap-${runId}`;
  mkdirSync(directory, { recursive: true }); const evidence = `${directory}/actual-jobs.jsonl`; writeFileSync(evidence, "", { flag: "wx" });
  const execute = streamIsolatedExecutor(evidence);
  try {
    const dom = await execute({ language: "javascript", source: "const warm=Boolean(require.cache[require.resolve('linkedom')]);const{parseHTML}=require('linkedom');console.log(JSON.stringify({warm,text:parseHTML('<p>Actual DOM bootstrap</p>').document.querySelector('p').textContent}));", timeLimitMs: 5000 });
    assert.equal(dom.status, "completed", dom.stderr); assert.equal(dom.isolationRuntime, "runsc");
    assert.deepEqual(JSON.parse(dom.stdout), { warm: true, text: "Actual DOM bootstrap" });
    const loop = await execute({ language: "javascript", source: "console.log('student-code-entered');while(true){}", timeLimitMs: 5000 });
    assert.equal(loop.status, "timeout"); assert.equal(loop.isolationRuntime, "runsc"); assert.equal(loop.exitCode, null); assert.match(loop.stdout, /student-code-entered/);
    assert.notEqual(loop.jobId, dom.jobId); assert.equal(loop.imageDigest, dom.imageDigest);
    writeFileSync(`${directory}/result.json`, JSON.stringify({ runId, passed: true, actualJobs: 2, actualGVisorDomLibraryPreloaded: true, actualDomParsed: true, studentInfiniteLoopTimedOut: true, requestedStudentLimitMs: 5000, isolationLimitsRelaxed: false, productionGatewayAuthenticationClaim: false }, null, 2), { flag: "wx" });
  } finally { await execute.close(); }
});
