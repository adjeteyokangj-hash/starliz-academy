import { spawn } from "node:child_process";
import { MAX_OUTPUT_BYTES, pinnedImage, validateJob, imageDigest } from "./protocol.mjs";

const readyMarker = "__STARLIZ_INTERPRETER_READY__\n";
const pythonBootstrap = `import sys,json,io
print(${JSON.stringify(readyMarker.trimEnd())},flush=True)
payload=json.loads(sys.stdin.read())
sys.stdin=io.StringIO(payload['stdin'])
scope={'__name__':'__main__'}
exec(compile(payload['source'],'learner.py','exec'),scope,scope)
`;
// The reviewed DOM image declares this fixed library path. Load its trusted
// engine dependency before readiness, rather than charging cold module I/O to
// the student's five-second budget. Generic JavaScript images remain supported.
// Learner supporting modules are deliberately not preloaded.
const javascriptBootstrap = `const fs=require('node:fs');if(process.env.NODE_PATH==='/opt/starliz-dom/node_modules')require('linkedom');fs.writeSync(1,${JSON.stringify(readyMarker)});const payload=JSON.parse(fs.readFileSync(0,'utf8'));new Function('input','require',payload.source)(payload.stdin,require);`;
const sqlBootstrap = `import sys,json,sqlite3
print(${JSON.stringify(readyMarker.trimEnd())},flush=True)
payload=json.loads(sys.stdin.read())
fixture=json.loads(payload['stdin'] or '{}')
database=sqlite3.connect(':memory:',isolation_level=None)
database.enable_load_extension(False)
database.set_authorizer(lambda action,a,b,c,d: sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
for statement in fixture.get('setup',[]):
 database.executescript(statement)
results=[]
statement=''
def execute(statement):
 cursor=database.execute(statement)
 if cursor.description:
  results.append({'columns':[field[0] for field in cursor.description],'rows':cursor.fetchall()})
for character in payload['source']:
 statement+=character
 if character==';' and sqlite3.complete_statement(statement):
  execute(statement)
  statement=''
if statement.strip(): execute(statement)
print(json.dumps({'results':results},ensure_ascii=False,separators=(',',':')))
`;

export function containerArguments(job, image, runtime = "runsc") {
  if (!validateJob(job) || !pinnedImage(image)) throw new Error("Invalid job or unpinned runtime image.");
  if (!["runsc", "runc"].includes(runtime)) throw new Error("Unreviewed container runtime.");
  const name = `starliz-coding-${job.jobId}`;
  const limits = ["create", "--interactive", "--pull=never", "--runtime", runtime, "--name", name,
    "--label=starliz.coding.runner=isolated-v1", `--label=starliz.coding.job=${job.jobId}`,
    `--label=starliz.coding.expires=${Date.now() + job.timeLimitMs + 30000}`,
    "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
    "--pids-limit=32", job.language === "javascript" ? "--ulimit=nproc=8:8" : "--ulimit=nproc=2:2", "--ulimit=nofile=128:128", "--memory=128m", "--memory-swap=128m", "--cpus=0.5",
    "--user=65534:65534", "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16777216,mode=1777", "--workdir=/tmp",
    "--env=PYTHONDONTWRITEBYTECODE=1", "--env=PYTHONUNBUFFERED=1", "--env=UV_THREADPOOL_SIZE=1",
    // The pinned JavaScript image starts through docker-entrypoint.sh. That
    // shell lookup is infrastructure work and, on a cold runsc sandbox, holds
    // the interpreter past the readiness window. Node is the reviewed command.
    ...(job.language === "javascript" ? ["--entrypoint", "node"] : []), image];
  return [...limits, ...(job.language === "javascript"
    ? ["-e", javascriptBootstrap]
    : ["python", "-I", "-S", "-c", job.language === "sql" ? sqlBootstrap : pythonBootstrap])];
}

/** The Docker client lives on the dedicated runner host, never in the web app. */
export async function executeContainer(job, image, docker = "docker", runtime = "runsc") {
  const args = containerArguments(job, image, runtime);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = "", stderr = "", bytes = 0, stopped = null, settled = false;
    let createdId = null, activeProcess = null, cleanupStarted = false;
    const finish = (exitCode, infrastructureError = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ jobId: job.jobId, language: job.language, stdout, stderr,
        imageDigest: imageDigest(image), isolationRuntime: runtime,
        exitCode, durationMs: Date.now() - startedAt,
        status: infrastructureError ? "infrastructure-error" : stopped || (exitCode === 0 ? "completed" : "runtime-error") });
    };
    const cleanupJob = (exitCode, infrastructureError = false) => {
      if (cleanupStarted || settled) return;
      cleanupStarted = true;
      clearTimeout(timer);
      activeProcess?.kill();
      // No learner source is sent until create succeeds. A creation timeout
      // can therefore never leave an executing program behind. A late daemon
      // response may leave stopped metadata for the host's expiry reaper.
      if (!createdId) { finish(null, true); return; }
      // Remove only the exact ID returned by this job's successful creation.
      // Never remove a same-name pre-existing container after a conflict.
      const cleanup = spawn(docker, ["rm", "--force", createdId], { stdio: "ignore", windowsHide: true });
      const cleanupDeadline = setTimeout(() => { cleanup.kill(); finish(null, true); }, 5000);
      cleanup.once("error", () => { clearTimeout(cleanupDeadline); finish(null, true); });
      cleanup.once("close", (code) => {
        clearTimeout(cleanupDeadline);
        finish(exitCode, infrastructureError || code !== 0);
      });
    };
    const stop = (reason) => {
      if (stopped || settled) return;
      stopped = reason;
      cleanupJob(null);
    };
    // Creating stopped container metadata is infrastructure setup, not learner
    // execution. Do not spend the code budget on an image's cold creation.
    let timer = setTimeout(() => cleanupJob(null, true), 10000);
    const capture = (chunk, channel) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) { stop("output-limit"); return; }
      if (channel === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
    };
    const creation = spawn(docker, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    activeProcess = creation;
    let creationOutput = "";
    creation.stdout.on("data", (chunk) => { if (creationOutput.length < 256) creationOutput += chunk; });
    creation.stderr.on("data", (chunk) => capture(chunk, "stderr"));
    creation.once("error", () => finish(null, true));
    creation.once("close", (code) => {
      if (settled || stopped) return;
      const id = creationOutput.trim();
      if (code !== 0 || !/^[a-f0-9]{64}$/.test(id)) { finish(null, true); return; }
      createdId = id;
      clearTimeout(timer);
      // Cold container/interpreter startup is infrastructure time. No learner
      // source is sent, and no assessment clock starts, before this fixed
      // bootstrap proves that the interpreter is ready to read its payload.
      // The reviewed DOM image loads its trusted library before that marker.
      // On this host that cold start can pass ten seconds; the learner budget
      // below stays capped at five seconds.
      timer = setTimeout(() => cleanupJob(null, true), 20000);
      const execution = spawn(docker, ["start", "--attach", "--interactive", createdId], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      activeProcess = execution;
      let ready = false, startupOutput = "";
      execution.stdout.on("data", (chunk) => {
        if (ready) { capture(chunk, "stdout"); return; }
        startupOutput += chunk.toString("utf8");
        if (startupOutput.length > 1024 || !readyMarker.startsWith(startupOutput.slice(0, readyMarker.length))) { cleanupJob(null, true); return; }
        if (startupOutput.length < readyMarker.length) return;
        ready = true;
        clearTimeout(timer);
        timer = setTimeout(() => stop("timeout"), job.timeLimitMs);
        const remainder = startupOutput.slice(readyMarker.length);
        if (remainder) capture(Buffer.from(remainder), "stdout");
        execution.stdin.end(JSON.stringify({ source: job.source, stdin: job.stdin }));
      });
      execution.stderr.on("data", (chunk) => capture(chunk, "stderr"));
      execution.once("error", () => cleanupJob(null, true));
      execution.once("close", () => {
        if (stopped || settled || cleanupStarted) return;
        if (!ready) { cleanupJob(null, true); return; }
        clearTimeout(timer);
        timer = setTimeout(() => cleanupJob(null, true), 5000);
        const inspection = spawn(docker, ["inspect", "--format", "{{.State.Running}} {{.State.ExitCode}}", createdId], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
        activeProcess = inspection;
        let state = "";
        inspection.stdout.on("data", (chunk) => { if (state.length < 128) state += chunk; });
        inspection.once("error", () => cleanupJob(null, true));
        inspection.once("close", (inspectCode) => {
          if (stopped || settled || cleanupStarted) return;
          const match = /^false (\d+)$/.exec(state.trim());
          cleanupJob(match ? Number(match[1]) : null, inspectCode !== 0 || !match);
        });
      });
      execution.stdin.on("error", () => { /* Early interpreter exit is handled by state inspection. */ });
    });
  });
}
