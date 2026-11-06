import { createInterface } from "node:readline";
import { executeContainer } from "../../services/coding-runner/container.mjs";
import { validateJob, pinnedImage, MAX_REQUEST_BYTES } from "../../services/coding-runner/protocol.mjs";

// A private test pipe reuses the Linux broker process. Each submitted program
// still gets its own real, pinned runsc container with unchanged isolation.
if (process.platform !== "linux" || process.env.CODING_RUNNER_CONTAINER_TESTS !== "1") throw new Error("Explicit Linux isolation testing is required.");
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (Buffer.byteLength(line) > MAX_REQUEST_BYTES + 1024) throw new Error("Oversized test transport request.");
  const input = JSON.parse(line), job = validateJob(input.job), image = pinnedImage(input.image);
  if (!job || !image || typeof input.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(input.requestId)) throw new Error("Invalid test transport request.");
  const result = await executeContainer(job, image, "/usr/bin/docker", "runsc");
  process.stdout.write(JSON.stringify({ requestId: input.requestId, result }) + "\n");
}
