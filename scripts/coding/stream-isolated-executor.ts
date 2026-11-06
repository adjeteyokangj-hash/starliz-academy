import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { executionResultSchema, type executeCodingSource } from "../../src/lib/coding/execution/client";
import pins from "../../src/lib/coding/learning/runtime-pins.json";

export function transportDiagnosticKind(text: string): "system-resources" | "entrypoint" | "unclassified" {
  const value = text.replaceAll("\0", "").slice(0, 4096);
  return /0x800705aa|insufficient system resources|out of memory|ENOMEM/i.test(value) ? "system-resources"
    : /cannot find module|ENOENT|node[^\n]*not found/i.test(value) ? "entrypoint" : "unclassified";
}

export function streamIsolatedExecutor(evidencePath: string): typeof executeCodingSource & { close: () => Promise<void> } {
  if (process.platform !== "win32" || process.env.CODING_RUNNER_CONTAINER_TESTS !== "1") throw new Error("Explicit authorised Windows-to-Ubuntu isolation verification is required.");
  const environment: NodeJS.ProcessEnv = { ...Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP"].flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : [])), NODE_ENV: "test", WSLENV: "" };
  const child = spawn("wsl", ["-d", "Ubuntu", "--exec", "/usr/bin/env", "-i", "PATH=/usr/bin:/usr/sbin:/bin:/sbin", "DOCKER_HOST=unix:///var/run/docker.sock", "CODING_RUNNER_CONTAINER_TESTS=1", "/usr/bin/node", "/mnt/c/Users/edwar/Documents/Projects/starliz-academy/scripts/coding/stream-local-test-jobs.mjs"], { windowsHide: true, env: environment });
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const diagnosticKinds = new Set<string>();
  const note = (event: string, metadata: Record<string, string | number | boolean | null> = {}) => appendFileSync(evidencePath, JSON.stringify({ event, sourceExecutionVerified: false, ...metadata }) + "\n");
  let buffered = "", closed = false, stopping = false;
  const fail = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("The real isolation test transport closed before returning a verified result.")); } pending.clear(); };
  const ended = new Promise<void>((resolve) => { child.once("close", (code, signal) => { note("test-transport-closed", { code, signal, requestedStop: stopping, pendingJobs: pending.size }); closed = true; fail(); resolve(); }); });
  child.on("error", fail);
  child.stderr.on("data", (chunk: Buffer) => { const kind = transportDiagnosticKind(chunk.toString("utf8")); if (!diagnosticKinds.has(kind)) { diagnosticKinds.add(kind); note("test-transport-stderr", { kind }); } });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffered += chunk;
    if (Buffer.byteLength(buffered) > 262144) { note("test-transport-response-limit"); fail(); child.kill(); return; }
    let newline: number;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
      try {
        const value = JSON.parse(line), item = pending.get(value.requestId);
        if (!item) throw new Error("Unexpected isolation response.");
        clearTimeout(item.timer); pending.delete(value.requestId); item.resolve(value.result);
      } catch { note("test-transport-invalid-response", { kind: transportDiagnosticKind(line), containsNul: line.includes("\0") }); fail(); child.kill(); return; }
    }
  });
  child.stdin.on("error", fail);
  const execute: typeof executeCodingSource = async (input) => {
    if (closed || stopping || pending.size) throw new Error("The sequential isolation test transport is unavailable or busy.");
    const expectedDigest = pins[input.language], image = input.language === "javascript" ? expectedDigest : `python@${expectedDigest}`;
    const job = { jobId: randomUUID(), language: input.language, source: input.source, stdin: input.stdin ?? "", timeLimitMs: input.timeLimitMs ?? 5000 }, requestId = randomUUID();
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { note("test-transport-deadline", { deadlineMs: 45000 }); pending.delete(requestId); reject(new Error("The real isolation test transport exceeded its deadline.")); child.kill(); }, 45000);
      pending.set(requestId, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ requestId, image, job }) + "\n");
    });
    const checked = executionResultSchema.safeParse(result);
    if (!checked.success) { note("test-transport-result-validation"); throw new Error("The isolation test transport returned an unsupported result."); }
    const parsed = checked.data;
    if (parsed.jobId !== job.jobId || parsed.language !== job.language || parsed.imageDigest !== expectedDigest || parsed.isolationRuntime !== "runsc" || input.expectedImageDigest && parsed.imageDigest !== input.expectedImageDigest) throw new Error("The real isolation result does not match its submitted job or reviewed runtime.");
    appendFileSync(evidencePath, JSON.stringify({ sourceHash: createHash("sha256").update(job.source).digest("hex"), transport: "private-persistent-test-pipe", ...parsed }) + "\n");
    return parsed;
  };
  return Object.assign(execute, { close: async () => {
    stopping = true; child.stdin.end();
    const timer = setTimeout(() => child.kill(), 5000);
    try { await ended; } finally { clearTimeout(timer); }
  } });
}
