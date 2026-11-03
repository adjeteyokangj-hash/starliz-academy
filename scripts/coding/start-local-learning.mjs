import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { sign, requestProof, responseProof, authentic } from "../../services/coding-runner/protocol.mjs";
import { createSupabaseExecutionGateway } from "../../services/coding-runner/supabase-gateway.mjs";

if (process.platform !== "win32") throw new Error("This coordinator uses the existing Windows/Ubuntu development environment.");
const secret = randomBytes(32).toString("hex");
const pins = JSON.parse(readFileSync(new URL("../../src/lib/coding/learning/runtime-pins.json", import.meta.url), "utf8"));
const windowsEnvironment = Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP"].flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
windowsEnvironment.WSLENV = "";
const runner = spawn("wsl", ["-d", "Ubuntu", "--exec", "/usr/bin/env", "-i", "PATH=/usr/bin:/usr/sbin:/bin:/sbin", "DOCKER_HOST=unix:///var/run/docker.sock", "/usr/bin/node", "/mnt/c/Users/edwar/Documents/Projects/starliz-academy/services/coding-runner/local-dev-server.mjs"], { windowsHide: true, env: windowsEnvironment, stdio: ["pipe", "pipe", "pipe"] });
let next = null, stopping = false, proxy = null;
const pending = new Map();
// Reuse the existing gateway without changing its authentication or execution
// behavior. Only this local development fetch carrier uses a private WSL pipe;
// the logical HTTPS hostname is never resolved or contacted on a network.
const gateway = createSupabaseExecutionGateway({ runnerUrl: "https://local-runner.invalid", secret, fetchImpl: (url, init) => new Promise((resolve, reject) => {
  if (pending.size >= 32 || stopping || new URL(url).origin !== "https://local-runner.invalid") { reject(new Error("Local transport unavailable")); return; }
  const requestId = randomUUID();
  const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("Local transport deadline")); }, 44000);
  pending.set(requestId, { resolve, reject, timer });
  runner.stdin.write(JSON.stringify({ requestId, method: init.method, path: new URL(url).pathname, headers: Object.fromEntries(new Headers(init.headers)), body: init.body ?? "" }) + "\n");
}) });
async function stop() {
  if (stopping) return;
  stopping = true;
  if (proxy) { proxy.closeAllConnections(); proxy.close(); }
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("Owned local transport stopped")); }
  pending.clear();
  runner.stdin.write('{"stop":true}\n'); runner.stdin.end();
  if (next?.pid) await new Promise((resolve) => {
    const kill = spawn("taskkill.exe", ["/PID", String(next.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    kill.once("error", resolve); kill.once("close", resolve);
  });
  process.stdin.pause();
}
process.once("SIGINT", () => void stop()); process.once("SIGTERM", () => void stop());
process.stdin.on("data", (chunk) => { if (String(chunk).trim() === "stop") void stop(); });
process.stdin.on("end", () => void stop());
runner.on("error", () => { console.error("The existing Ubuntu runner could not start."); process.exitCode = 1; void stop(); });
runner.stderr.on("data", (chunk) => process.stderr.write(chunk));
const lines = createInterface({ input: runner.stdout });
lines.on("line", async (line) => {
  if (line.length > 300000) { process.exitCode = 1; void stop(); return; }
  if (line.startsWith('{"requestId":')) {
    try { const response = JSON.parse(line), request = pending.get(response.requestId); if (request) { clearTimeout(request.timer); pending.delete(response.requestId); request.resolve(new Response(response.body, { status: response.status, headers: response.headers })); } }
    catch { console.error("Invalid private local transport response."); process.exitCode = 1; void stop(); }
    return;
  }
  if (line !== '{"ready":true,"port":4319}' || next || stopping) return;
  try {
    proxy = createServer(async (request, response) => {
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) if (typeof value === "string") headers.set(key, value);
        const webRequest = new Request(`http://127.0.0.1:4318${request.url}`, { method: request.method, headers,
          ...(request.method === "POST" ? { body: Readable.toWeb(request), duplex: "half" } : {}) });
        const result = await gateway(webRequest);
        response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
      } catch { response.writeHead(503).end(); }
    });
    proxy.maxConnections = 32; proxy.headersTimeout = 5000; proxy.requestTimeout = 10000;
    await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(4318, "127.0.0.1", resolve); });
    const nonce = randomUUID(), timestamp = String(Date.now());
    const health = await fetch("http://127.0.0.1:4318/health", { headers: { "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": nonce, "X-Coding-Signature": sign(secret, requestProof("GET", "/health", timestamp, nonce, "")) }, signal: AbortSignal.timeout(10000) });
    const body = await health.text();
    if (!health.ok || !authentic(secret, responseProof(nonce, "", body), health.headers.get("x-coding-signature"))) throw new Error("The local health response failed authentication.");
    const availability = JSON.parse(body);
    if (!availability.available) { console.error("Local engine availability:", JSON.stringify(availability.engines)); throw new Error("The real isolation runtime did not pass its startup health check."); }
    console.log("The authenticated local Linux runner is ready. No secret was written to disk.");
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3000"], { windowsHide: true, env: { ...process.env, CODING_RUNNER_URL: "http://127.0.0.1:4318/functions/v1/coding-execution", CODING_RUNNER_SECRET: secret }, stdio: ["ignore", "pipe", "pipe"] });
    next.stdout.on("data", (chunk) => process.stdout.write(chunk)); next.stderr.on("data", (chunk) => process.stderr.write(chunk));
    next.once("exit", () => void stop());
    console.log("Type stop to close only these owned development processes.");
  } catch (error) { console.error("Local runner startup verification failed; the app was not started.", error instanceof Error ? error.message : "Unknown startup error"); process.exitCode = 1; void stop(); }
});
runner.once("exit", (code) => { if (!stopping) { console.error("The local Linux runner stopped; closing its owned app process."); process.exitCode = code || 1; void stop(); } });
runner.stdin.write(JSON.stringify({ secret, pythonImage: `python@${pins.python}`, javascriptImage: pins.javascript }) + "\n");
