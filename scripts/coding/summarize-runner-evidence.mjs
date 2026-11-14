import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const input = process.argv[2];
if (!input) throw new Error("Supply a real runner JSONL evidence path.");
const rows = fs.readFileSync(input, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const header = rows[0], completed = rows.at(-1);
if (!/^[a-f0-9-]{36}$/.test(header.runId) || completed.runId !== header.runId || completed.suitePassed !== true) throw new Error("The recorded real suite did not pass.");
const jobs = rows.flatMap((row) => row.result ? [row.result] : row.jobId ? [row] : []);
if (!jobs.length || jobs.some((job) => job.isolationRuntime !== "runsc" || job.status === "infrastructure-error")) throw new Error("The evidence contains unverified or failed infrastructure execution.");
const files = ["services/coding-runner/container.mjs", "services/coding-runner/server.mjs", "services/coding-runner/protocol.mjs", "tests/coding_runner_containers.test.mjs"];
const summary = { runId: header.runId, realSuitePassed: true, executedJobs: jobs.length,
  runtime: header.runtime, kernel: header.kernel, brokerNode: header.node, python: header.python, javascript: header.javascript,
  statuses: Object.fromEntries([...new Set(jobs.map((job) => job.status))].map((status) => [status, jobs.filter((job) => job.status === status).length])),
  sourceHashes: files.map((file) => ({ file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") })),
  limitations: ["Local WSL2 verification; not a deployed service", "Hosted Edge transport, CPU/PID stress, crash recovery and sustained production load remain unverified"],
};
const output = path.join(path.dirname(input), `verification-${header.runId}.json`);
fs.writeFileSync(output, JSON.stringify(summary, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, executedJobs: jobs.length, realSuitePassed: true }));
