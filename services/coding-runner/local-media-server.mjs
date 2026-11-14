import { createInterface } from "node:readline";
import { createRunnerServer } from "./server.mjs";
import { pinnedImage } from "./protocol.mjs";
if (process.platform !== "linux" || process.env.CODING_RUNNER_CONTAINER_TESTS !== "1") throw new Error("Explicit local Linux media verification is required.");
const input = createInterface({ input: process.stdin }); let server = null, configured = false;
input.on("line", line => {
  try {
    const value = JSON.parse(line);
    if (configured) { if (value.stop === true) { input.close(); server?.close(); } return; }
    if (line.length > 1024 || !pinnedImage(value.image) || typeof value.secret !== "string" || value.secret.length < 32) throw new Error("Invalid private media coordinator configuration.");
    configured = true; server = createRunnerServer({ secret: value.secret, mediaImage: value.image, pythonImage: value.pythonImage, javascriptImage: value.javascriptImage, containerRuntime: "runsc", docker: "/usr/bin/docker" });
    server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port })));
  } catch { process.exitCode = 1; input.close(); server?.close(); }
});
input.on("close", () => server?.close());
process.on("SIGTERM", () => { input.close(); server?.close(); });
