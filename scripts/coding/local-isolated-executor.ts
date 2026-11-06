import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { executionResultSchema, type executeCodingSource } from "../../src/lib/coding/execution/client";
import pins from "../../src/lib/coding/learning/runtime-pins.json";

export function localIsolatedExecutor(evidencePath: string): typeof executeCodingSource {
  if (process.platform !== "win32" || process.env.CODING_RUNNER_CONTAINER_TESTS !== "1") throw new Error("Explicit authorised Windows-to-Ubuntu isolation verification is required.");
  return async (input) => {
    const expectedDigest = pins[input.language], image = input.language === "javascript" ? expectedDigest : `python@${expectedDigest}`;
    const job = { jobId: randomUUID(), language: input.language, source: input.source, stdin: input.stdin ?? "", timeLimitMs: input.timeLimitMs ?? 5000 };
    const result = await new Promise<unknown>((resolve, reject) => {
      const child = spawn("wsl", ["-d", "Ubuntu", "--exec", "/usr/bin/env", "CODING_RUNNER_CONTAINER_TESTS=1", "/usr/bin/node", "/mnt/c/Users/edwar/Documents/Projects/starliz-academy/scripts/coding/execute-local-test-job.mjs"], { windowsHide: true });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("The real isolation transport exceeded its deadline.")); }, 45000);
      child.stdout.on("data", (chunk) => { if (stdout.length < 131072) stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { if (stderr.length < 8192) stderr += String(chunk); });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(stderr || "The real isolation broker failed."));
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify({ image, job }));
    });
    const parsed = executionResultSchema.parse(result);
    if (parsed.jobId !== job.jobId || parsed.language !== job.language || parsed.imageDigest !== expectedDigest || parsed.isolationRuntime !== "runsc" || input.expectedImageDigest && parsed.imageDigest !== input.expectedImageDigest) throw new Error("The local execution result does not match the reviewed job or runtime.");
    appendFileSync(evidencePath, JSON.stringify({ sourceHash: createHash("sha256").update(job.source).digest("hex"), ...parsed }) + "\n");
    return parsed;
  };
}
