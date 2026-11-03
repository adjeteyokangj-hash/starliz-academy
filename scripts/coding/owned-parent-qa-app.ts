import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { appendFileSync } from "node:fs";

/** Parent-reader acceptance server only. Execution is explicitly unavailable;
 * no Docker, WSL, gateway, isolation probe or curriculum publication is used. */
export async function ownedParentQaApp(log: string) {
  const socket = createServer(); await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const address = socket.address(); if (!address || typeof address === "string") throw new Error("An owned QA port is unavailable.");
  const port = address.port; await new Promise<void>(resolve => socket.close(() => resolve()));
  const child = spawn(process.execPath, ["--max-old-space-size=1024", "node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], { windowsHide: true, env: { ...process.env, NODE_ENV: "development", NODE_OPTIONS: "--max-old-space-size=1024", CODING_RUNNER_URL: "", CODING_MEDIA_RUNNER_URL: "", CODING_CURRICULUM_QA_ENABLED: "", CODING_RUNNER_CONTAINER_TESTS: "" }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", chunk => appendFileSync(log, chunk)); child.stderr.on("data", chunk => appendFileSync(log, chunk));
  let stopped = false;
  async function stop() { if (stopped) return; stopped = true; if (child.pid && child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => { const cleanup = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); cleanup.once("error", () => resolve()); cleanup.once("close", () => resolve()); }); }
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) throw new Error("The owned parent QA app stopped before readiness.");
      try { const response = await fetch(`${base}/api/auth/session`, { signal: AbortSignal.timeout(1500) }); if (response.status < 500) return { base, stop }; } catch { /* bounded startup only */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("The owned parent QA app did not become ready.");
  } catch (error) { await stop(); throw error; }
}
