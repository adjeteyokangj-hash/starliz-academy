import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execute = promisify(execFile);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function expiredOwnedContainer(value, now = Date.now()) {
  const labels = value?.Config?.Labels;
  const job = labels?.["starliz.coding.job"];
  const expires = labels?.["starliz.coding.expires"];
  return typeof value?.Id === "string" && /^[a-f0-9]{64}$/.test(value.Id)
    && labels?.["starliz.coding.runner"] === "isolated-v1" && typeof job === "string" && uuid.test(job)
    && value.Name === `/starliz-coding-${job}` && typeof expires === "string" && /^\d{13}$/.test(expires)
    && Number(expires) < now;
}

/** Remove only expired, labelled execution containers. Never use a Docker prune. */
export async function reapExpired({ docker = "docker", now = Date.now(), jobIds } = {}) {
  if (jobIds !== undefined && (!Array.isArray(jobIds) || !jobIds.length || jobIds.length > 32 || jobIds.some((id) => typeof id !== "string" || !uuid.test(id)))) throw new Error("Use an explicit bounded list of generated job UUIDs.");
  const command = async (args) => (await execute(docker, args, { timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true })).stdout;
  const ids = (await command(["ps", "--all", "--quiet", "--no-trunc", "--filter", "label=starliz.coding.runner=isolated-v1"]))
    .trim().split(/\s+/).filter((id) => /^[a-f0-9]{64}$/.test(id));
  const removed = [];
  for (const id of ids) {
    let value;
    try { [value] = JSON.parse(await command(["inspect", id])); } catch { continue; }
    if (value.Id !== id || jobIds && !jobIds.includes(value.Config?.Labels?.["starliz.coding.job"]) || !expiredOwnedContainer(value, now)) continue;
    await command(["rm", "--force", id]);
    removed.push(id);
  }
  return { inspected: ids.length, removed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await reapExpired()));
}
