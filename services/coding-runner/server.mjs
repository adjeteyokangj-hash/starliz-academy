import http from "node:http";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { executeContainer } from "./container.mjs";
import { executeMediaContainer } from "./media-container.mjs";
import { MAX_CLOCK_SKEW_MS, MAX_REQUEST_BYTES, authentic, pinnedImage, imageDigest, requestProof, responseProof, sign, validateJob } from "./protocol.mjs";

export function createRunnerServer(config) {
  if (typeof config.secret !== "string" || config.secret.length < 32) throw new Error("A dedicated runner secret of at least 32 characters is required.");
  const runtime = config.containerRuntime || "runsc";
  if (runtime !== "runsc" && !(runtime === "runc" && config.mode === "development")) throw new Error("Production execution requires runsc.");
  const images = { python: pinnedImage(config.pythonImage), javascript: pinnedImage(config.javascriptImage), sql: pinnedImage(config.pythonImage) };
  const mediaImage = pinnedImage(config.mediaImage);
  const used = new Map();
  let active = 0;
  const docker = config.docker || "docker";
  const inspect = (image) => new Promise((resolve) => {
    if (!image) return resolve(false);
    const command = spawn(docker, ["image", "inspect", "--format", "{{.Id}} {{json .RepoDigests}}", image], { windowsHide: true });
    let stdout = "";
    const timer = setTimeout(() => { command.kill(); resolve(false); }, 3000);
    command.stdout.on("data", (chunk) => { if (stdout.length < 8192) stdout += chunk; });
    command.on("error", () => { clearTimeout(timer); resolve(false); });
    command.on("close", (code) => { clearTimeout(timer); resolve(code === 0 && stdout.includes(imageDigest(image))); });
  });
  const runtimeAvailable = () => new Promise((resolve) => {
    const command = spawn(docker, ["info", "--format", "{{range $name, $runtime := .Runtimes}}{{$name}} {{end}}"], { windowsHide: true });
    let stdout = "";
    const timer = setTimeout(() => { command.kill(); resolve(false); }, 3000);
    command.stdout.on("data", (chunk) => { if (stdout.length < 8192) stdout += chunk; });
    command.on("error", () => { clearTimeout(timer); resolve(false); });
    command.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && stdout.trim().split(/\s+/).includes(runtime));
    });
  });
  const server = http.createServer(async (request, response) => {
    request.setTimeout(5000, () => request.destroy());
    const pathname = request.url;
    const method = request.method;
    if (!((method === "POST" && ["/execute", "/validate-media"].includes(pathname)) || (method === "GET" && pathname === "/health"))) {
      response.writeHead(404).end(); return;
    }
    const chunks = [];
    let length = 0;
    try {
      for await (const chunk of request) {
        length += chunk.length;
        if (length > (pathname === "/validate-media" ? 4 * 1024 * 1024 : MAX_REQUEST_BYTES)) { response.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
    } catch { response.destroy(); return; }
    // The short idle limit protects body uploads. Once the body is complete,
    // allow the separately bounded preparation/execution/cleanup phases.
    request.setTimeout(45000);
    const rawBody = Buffer.concat(chunks);
    const body = pathname === "/validate-media" ? rawBody : rawBody.toString("utf8");
    const timestamp = request.headers["x-coding-timestamp"];
    const nonce = request.headers["x-coding-nonce"];
    const signature = request.headers["x-coding-signature"];
    const reply = (status, data) => {
      const output = JSON.stringify(data);
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
        "X-Coding-Signature": sign(config.secret, responseProof(nonce, body, output)) }).end(output);
    };
    if (typeof timestamp !== "string" || typeof nonce !== "string" || !/^[a-f0-9-]{36}$/i.test(nonce)
      || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > MAX_CLOCK_SKEW_MS
      || !authentic(config.secret, requestProof(method, pathname, timestamp, nonce, body), signature)) {
      response.writeHead(401).end(); return;
    }
    for (const [key, expiresAt] of used) if (expiresAt < Date.now()) used.delete(key);
    if (used.has(nonce)) { reply(409, { error: "Request already used." }); return; }
    if (used.size >= 4096) { reply(503, { error: "Runner is busy." }); return; }
    used.set(nonce, Date.now() + 2 * MAX_CLOCK_SKEW_MS);
    if (pathname === "/health") {
      const supported = await runtimeAvailable();
      const availability = Object.fromEntries(await Promise.all(Object.entries(images).map(async ([language, image]) => [language, supported && await inspect(image)])));
      reply(200, { available: Object.values(availability).every(Boolean), engines: availability }); return;
    }
    if (pathname === "/validate-media") {
      if (runtime !== "runsc" || !mediaImage) { reply(503, { error: "The pinned isolated media decoder is not configured." }); return; }
      if (rawBody.length < 128 || request.headers["content-type"] !== "video/webm") { reply(400, { error: "Invalid video payload." }); return; }
      if (active >= 2) { reply(503, { error: "Runner is busy. Try again shortly." }); return; }
      active++;
      try { const result = await executeMediaContainer(nonce, rawBody, mediaImage, docker); reply(result.status === "valid" ? 200 : result.status === "invalid-media" ? 422 : 503, result); }
      catch { reply(503, { error: "Isolated media validation is unavailable." }); }
      finally { active--; }
      return;
    }
    let job;
    try { job = validateJob(JSON.parse(body)); } catch { job = null; }
    if (!job || job.jobId !== nonce) { reply(400, { error: "Invalid execution request." }); return; }
    if (!images[job.language]) { reply(503, { error: "The pinned language runtime is not configured." }); return; }
    if (active >= 2) { reply(503, { error: "Runner is busy. Try again shortly." }); return; }
    active++;
    try {
      const execute = config.execute || executeContainer;
      reply(200, await execute(job, images[job.language], docker, runtime));
    } catch { reply(503, { error: "Execution infrastructure is unavailable." }); }
    finally { active--; }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10_000;
  server.maxConnections = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const containerRuntime = process.env.CODING_RUNNER_CONTAINER_RUNTIME || "runsc";
  if (containerRuntime !== "runsc" && !(containerRuntime === "runc" && process.env.CODING_RUNNER_MODE === "development")) {
    throw new Error("Production code execution requires the reviewed gVisor runsc runtime.");
  }
  const server = createRunnerServer({ secret: process.env.CODING_RUNNER_SECRET,
    pythonImage: process.env.CODING_RUNNER_PYTHON_IMAGE, javascriptImage: process.env.CODING_RUNNER_JAVASCRIPT_IMAGE, mediaImage: process.env.CODING_RUNNER_MEDIA_IMAGE, containerRuntime, mode: process.env.CODING_RUNNER_MODE });
  server.listen(Number(process.env.CODING_RUNNER_PORT || 4319), process.env.CODING_RUNNER_BIND || "127.0.0.1", () => console.log("Coding runner listening; no source code or credentials are logged."));
}
