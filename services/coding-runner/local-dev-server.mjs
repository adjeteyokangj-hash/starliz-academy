import { createInterface } from "node:readline";
import { createRunnerServer } from "./server.mjs";

// The local coordinator supplies only the dedicated HMAC secret through its
// private stdin pipe. No application/database/model credentials are loaded.
if (process.platform !== "linux") throw new Error("The local runner must execute on Linux.");
const input = createInterface({ input: process.stdin });
let server = null, configured = false;
function stop() {
  input.close();
  if (server) server.close(() => process.exitCode = 0);
}
input.on("line", async (line) => {
  if (line.length > 200000) { process.exitCode = 1; stop(); return; }
  try {
    const message = JSON.parse(line);
    if (configured) {
      if (message.stop === true) { stop(); return; }
      if (typeof message.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(message.requestId)
        || !["/health", "/execute"].includes(message.path) || !["GET", "POST"].includes(message.method)
        || typeof message.body !== "string" || Buffer.byteLength(message.body) > 98304 || !message.headers || typeof message.headers !== "object") return;
      try {
        const response = await fetch(`http://127.0.0.1:4319${message.path}`, { method: message.method, headers: message.headers,
          body: message.method === "POST" ? message.body : undefined, redirect: "error", signal: AbortSignal.timeout(44000) });
        const body = await response.text();
        if (Buffer.byteLength(body) > 100000) throw new Error("Response limit");
        process.stdout.write(JSON.stringify({ requestId: message.requestId, status: response.status, headers: { "content-type": "application/json", "x-coding-signature": response.headers.get("x-coding-signature") ?? "" }, body }) + "\n");
      } catch { process.stdout.write(JSON.stringify({ requestId: message.requestId, status: 503, headers: {}, body: '{"error":"Local execution transport unavailable"}' }) + "\n"); }
      return;
    }
    if (typeof message.secret !== "string" || !/^[a-f0-9]{64}$/.test(message.secret)) throw new Error("Invalid dedicated local-runner configuration.");
    configured = true;
    server = createRunnerServer({ secret: message.secret, pythonImage: message.pythonImage, javascriptImage: message.javascriptImage, containerRuntime: "runsc", mode: "development", docker: "/usr/bin/docker" });
    server.on("error", () => { process.stderr.write("The local runner could not bind its loopback port.\n"); process.exitCode = 1; input.close(); });
    server.listen(4319, "127.0.0.1", () => process.stdout.write('{"ready":true,"port":4319}\n'));
  } catch { process.stderr.write("Invalid local-runner startup message.\n"); process.exitCode = 1; stop(); }
});
input.on("close", () => { if (server?.listening) server.close(); });
process.once("SIGINT", stop); process.once("SIGTERM", stop);
