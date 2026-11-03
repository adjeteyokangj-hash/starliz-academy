import { readFileSync } from "node:fs";
import { executeContainer } from "../../services/coding-runner/container.mjs";
import { validateJob, pinnedImage } from "../../services/coding-runner/protocol.mjs";

// Test-only stdin transport. It neither opens a listener nor loads application
// configuration or secrets into the dedicated execution environment.
if (process.platform !== "linux" || process.env.CODING_RUNNER_CONTAINER_TESTS !== "1") throw new Error("Explicit Linux isolation testing is required.");
const input = JSON.parse(readFileSync(0, "utf8"));
const job = validateJob(input.job), image = pinnedImage(input.image);
if (!job || !image) throw new Error("Invalid isolated test request.");
const result = await executeContainer(job, image, "/usr/bin/docker", "runsc");
process.stdout.write(JSON.stringify(result));
