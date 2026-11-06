import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeContainer } from "../services/coding-runner/container.mjs";
import { pinnedImage } from "../services/coding-runner/protocol.mjs";

test("real gVisor process and CPU limits remain enforced under bounded stress", {
  skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" ? "Requires real Linux Docker/runsc; no simulated isolation result." : false,
  timeout: 90000,
}, async () => {
  assert.equal(process.platform, "linux");
  const image = pinnedImage(process.env.CODING_RUNNER_PYTHON_IMAGE);
  assert.ok(image);
  const runId = randomUUID(), evidence = `artifacts/coding-runner/resources-${runId}.jsonl`;
  fs.mkdirSync("artifacts/coding-runner", { recursive: true });
  fs.writeFileSync(evidence, JSON.stringify({ runId, actualExecutionAttempt: true, isolationRuntime: "runsc", image }) + "\n", { flag: "wx" });
  const run = async (name, source) => {
    const jobId = randomUUID();
    let finished = false;
    const executing = executeContainer({ jobId, language: "python", source, stdin: "", timeLimitMs: 5000 }, image, "docker", "runsc").finally(() => { finished = true; });
    const samples = [];
    if (name === "cpu-quota") {
      while (!finished) {
        try {
          const { stdout } = await promisify(execFile)("docker", ["inspect", "--format", "{{.State.Pid}}", `starliz-coding-${jobId}`], { timeout: 1500 });
          const pid = Number(stdout.trim());
          if (pid > 0) {
            const relative = fs.readFileSync(`/proc/${pid}/cgroup`, "utf8").split("\n").find((line) => line.startsWith("0::"))?.slice(3);
            if (relative && !relative.includes("..")) {
              const directory = `/sys/fs/cgroup${relative}`;
              samples.push({ quota: fs.readFileSync(`${directory}/cpu.max`, "utf8").trim(), statistics: fs.readFileSync(`${directory}/cpu.stat`, "utf8").trim() });
            }
          }
        } catch { /* Container may not yet exist, or may already be reaped. */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const result = await executing;
    fs.appendFileSync(evidence, JSON.stringify({ name, sourceHash: createHash("sha256").update(source).digest("hex"), hostCpuSamples: samples, ...result }) + "\n");
    assert.equal(result.status, "completed", `${name}: ${result.stderr}`);
    return { ...JSON.parse(result.stdout), hostCpuSamples: samples };
  };
  // A fixed maximum of 40 children, each immediately sleeping, is deliberately
  // bounded. Always reap our own children, even if creation is denied.
  const processes = await run("process-limit", `import os,time,json,signal,errno,sys,resource
print('guest process limit',resource.getrlimit(resource.RLIMIT_NPROC),file=sys.stderr,flush=True)
children=[]
denied=False
try:
 for index in range(40):
  print('creating child',index,file=sys.stderr,flush=True)
  try:
   pid=os.fork()
  except OSError as error:
   if error.errno not in (errno.EAGAIN,errno.ENOMEM): raise
   denied=True
   break
  if pid==0:
   time.sleep(3)
   os._exit(0)
  children.append(pid)
finally:
 for pid in children:
  try: os.kill(pid,signal.SIGKILL)
  except ProcessLookupError: pass
 for pid in children: os.waitpid(pid,0)
print(json.dumps({'created':len(children),'denied':denied}))`);
  assert.equal(processes.denied, true, "The process boundary must deny further children");
  assert.ok(processes.created < 32, "The interpreter and children share the 32-process boundary");
  const cpu = await run("cpu-quota", `import time,json
start=time.monotonic()
before=time.process_time()
counter=0
while time.monotonic()-start < 1.5: counter+=1
print(json.dumps({'wall':time.monotonic()-start,'cpu':time.process_time()-before,'iterations':counter}))`);
  assert.ok(cpu.iterations > 0);
  assert.ok(cpu.hostCpuSamples.length > 0, "Collect actual host cgroup evidence rather than relying on a virtual process clock");
  assert.ok(cpu.hostCpuSamples.every((sample) => { const [quota, period] = sample.quota.split(" ").map(Number); return quota > 0 && period > 0 && quota / period === 0.5; }), "The live cgroup enforces the configured half-CPU quota");
  assert.ok(cpu.hostCpuSamples.some((sample) => /nr_throttled ([1-9]\d*)/.test(sample.statistics)), "Actual CPU contention triggers cgroup throttling");
});

test("real JavaScript process pressure is denied and subsequent jobs remain executable", {
  skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" ? "Requires real Linux Docker/runsc; no simulated isolation result." : false,
  timeout: 90000,
}, async () => {
  assert.equal(process.platform, "linux");
  const image = pinnedImage(process.env.CODING_RUNNER_JAVASCRIPT_IMAGE); assert.ok(image);
  const runId = randomUUID(), evidence = `artifacts/coding-runner/javascript-resources-${runId}.jsonl`;
  fs.mkdirSync("artifacts/coding-runner", { recursive: true });
  fs.writeFileSync(evidence, JSON.stringify({ runId, actualExecutionAttempt: true, isolationRuntime: "runsc", image }) + "\n", { flag: "wx" });
  const execute = async (source) => {
    const result = await executeContainer({ jobId: randomUUID(), language: "javascript", source, stdin: "", timeLimitMs: 5000 }, image, "docker", "runsc");
    fs.appendFileSync(evidence, JSON.stringify({ sourceHash: createHash("sha256").update(source).digest("hex"), ...result }) + "\n");
    return result;
  };
  const pressure = await execute(`const {spawn}=require('node:child_process');let created=0,denied=0;const pending=[];for(let i=0;i<12;i++){pending.push(new Promise(resolve=>{const child=spawn('/bin/sleep',['1'],{stdio:'ignore'});if(child.pid)created++;child.once('error',error=>{if(error.code==='EAGAIN'||error.code==='ENOMEM')denied++;else console.error(error.code);});child.once('close',resolve);}));}Promise.all(pending).then(()=>console.log(JSON.stringify({created,denied})));`);
  const recovery = await execute("console.log('next-job-isolated-and-healthy')");
  assert.equal(recovery.status, "completed"); assert.equal(recovery.stdout, "next-job-isolated-and-healthy\n");
  assert.equal(pressure.status, "completed", pressure.stderr);
  const output = JSON.parse(pressure.stdout); assert.ok(output.denied > 0); assert.ok(output.created < 8);
  const asynchronousFile = await execute("require('node:fs/promises').writeFile('/tmp/actual-async.txt','actual').then(()=>require('node:fs/promises').readFile('/tmp/actual-async.txt','utf8')).then(console.log)");
  assert.equal(asynchronousFile.status, "completed", asynchronousFile.stderr); assert.equal(asynchronousFile.stdout, "actual\n");
});
