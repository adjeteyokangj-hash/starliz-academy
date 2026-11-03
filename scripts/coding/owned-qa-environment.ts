import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pins from "../../src/lib/coding/learning/runtime-pins.json";

/** Creates only this test's private runner and Next process. Existing servers,
 * applications, WSL, Docker and development files are never reset or stopped. */
export async function ownedQaEnvironment(childIds: string[], log: string) {
  const egressGuard = pathToFileURL(resolve("scripts/coding/qa-model-egress-guard.mjs")).href;
  if (process.platform !== "win32" || process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" || !childIds.length || childIds.length > 4) throw new Error("Explicit bounded local Coding QA is required.");
  const secret = randomBytes(48).toString("hex");
  const runner = spawn("wsl", ["-d", "Ubuntu", "--exec", "/usr/bin/env", "-i", "PATH=/usr/bin:/usr/sbin:/bin:/sbin", "DOCKER_HOST=unix:///var/run/docker.sock", "CODING_RUNNER_CONTAINER_TESTS=1", "/usr/bin/node", "/mnt/c/Users/edwar/Documents/Projects/starliz-academy/services/coding-runner/local-media-server.mjs"], { windowsHide: true, env: { NODE_ENV: "test", WSLENV: "", ...Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP"].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])) } });
  runner.stdin.on("error", () => { /* Startup/close evidence handles an unavailable owned broker. */ });
  let next: ReturnType<typeof spawn> | null = null, stopped = false;
  const closed = new Promise<void>(resolve => runner.once("close", () => resolve()));
  async function stop() {
    if (stopped) return; stopped = true;
    if (next?.pid && next.exitCode === null && next.signalCode === null) await new Promise<void>(resolve => { const cleanup = spawn("taskkill.exe", ["/PID", String(next!.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); cleanup.once("error", () => resolve()); cleanup.once("close", () => resolve()); });
    runner.stdin.end(JSON.stringify({ stop: true }) + "\n"); const deadline = setTimeout(() => runner.kill(), 5000); await closed; clearTimeout(deadline);
  }
  try {
    const listening = new Promise<number>((resolve, reject) => { let output = ""; const timeout = setTimeout(() => reject(new Error("The owned Linux QA runner did not start.")), 25000); runner.once("error", reject); runner.once("close", () => { clearTimeout(timeout); reject(new Error("The owned Linux QA runner stopped before readiness.")); }); runner.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); if (output.length > 4096) { clearTimeout(timeout); reject(new Error("Unexpected private runner output.")); return; } const line = output.split("\n")[0]; if (line) { try { const value = JSON.parse(line); if (Number.isInteger(value.port) && value.port > 0) { clearTimeout(timeout); resolve(value.port); } } catch { /* wait for the complete bounded line */ } } }); runner.stderr.resume(); });
    runner.stdin.write(JSON.stringify({ secret, image: pins.media, pythonImage: `python@${pins.python}`, javascriptImage: pins.javascript }) + "\n");
    const runnerPort = await listening;
    const reservation = createServer(); await new Promise<void>((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
    const address = reservation.address(); if (!address || typeof address === "string") throw new Error("Could not reserve an owned QA app port."); const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
    next = spawn(process.execPath, ["--max-old-space-size=2048", "node_modules/next/dist/bin/next", "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", String(port)], { windowsHide: true, env: { ...process.env, NODE_ENV: "development", VERCEL: "", CLOUDFLARE_R2_ENDPOINT: "", CLOUDFLARE_R2_ACCOUNT_ID: "", CLOUDFLARE_R2_BUCKET: "", CLOUDFLARE_R2_BUCKET_NAME: "", CLOUDFLARE_R2_ACCESS_KEY_ID: "", CLOUDFLARE_R2_SECRET_ACCESS_KEY: "", CODING_AI_ZERO_DATA_RETENTION_VERIFIED: "", CODING_QA_DISABLE_LIVE_MODEL: "true", CODING_QA_BUILD_ID: randomUUID(), NODE_OPTIONS: `--max-old-space-size=2048 --import=${egressGuard}`, CODING_RUNNER_URL: `http://127.0.0.1:${runnerPort}`, CODING_MEDIA_RUNNER_URL: `http://127.0.0.1:${runnerPort}`, CODING_RUNNER_SECRET: secret, CODING_RUNNER_MEDIA_IMAGE: pins.media, CODING_MEDIA_LOCAL: "true", CODING_CURRICULUM_QA_ENABLED: "true", CODING_CURRICULUM_QA_CHILD_IDS: childIds.join(",") }, stdio: ["ignore", "pipe", "pipe"] });
    // Logs contain normal Next diagnostics only; never log the private secret,
    // cookies, database URLs, upload bodies or the child fixture password.
    next.stdout?.on("data", chunk => appendFileSync(log, chunk)); next.stderr?.on("data", chunk => appendFileSync(log, chunk));
    const base = `http://127.0.0.1:${port}`; let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) { if (next.exitCode !== null) throw new Error("The owned QA app failed to start; existing development servers were retained."); try { const response = await fetch(`${base}/api/auth/session`, { signal: AbortSignal.timeout(1000) }); if (response.status < 500) { ready = true; break; } } catch { /* bounded startup wait, no environment restart */ } await new Promise(resolve => setTimeout(resolve, 1000)); }
    if (!ready) throw new Error("The owned QA app did not become ready.");
    return { base, stop };
  } catch (error) { await stop(); throw error; }
}
