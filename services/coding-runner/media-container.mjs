import { spawn } from "node:child_process";
import { imageDigest, pinnedImage } from "./protocol.mjs";

export function mediaContainerArguments(jobId, image, runtime = "runsc") {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(jobId) || !pinnedImage(image) || runtime !== "runsc") throw new Error("A pinned isolated media runtime is required.");
  return ["create", "--interactive", "--pull=never", "--runtime=runsc", "--name", `starliz-coding-${jobId}`,
    "--label=starliz.coding.runner=isolated-v1", `--label=starliz.coding.job=${jobId}`, `--label=starliz.coding.expires=${Date.now() + 40000}`,
    "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--pids-limit=32", "--ulimit=nproc=16:16", "--ulimit=nofile=64:64",
    "--memory=256m", "--memory-swap=256m", "--cpus=0.5", "--user=65534:65534", "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8388608,mode=1777", "--workdir=/tmp",
    "--env=PYTHONDONTWRITEBYTECODE=1", "--env=PYTHONUNBUFFERED=1", image];
}

/** Video bytes are decoded only by the fixed entry point in this separate
 * profile. This never changes the student language jobs' existing limits. */
export async function executeMediaContainer(jobId, bytes, image, docker = "docker") {
  if (!Buffer.isBuffer(bytes) || bytes.length < 128 || bytes.length > 4 * 1024 * 1024) throw new Error("Invalid media payload size.");
  const args = mediaContainerArguments(jobId, image);
  return new Promise(resolve => {
    let containerId = null, active = null, settled = false, cleaning = false, stdout = "", stderr = "", outputBytes = 0, reason = null;
    let timer;
    const finish = (status, details = null) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ jobId, status, details, imageDigest: imageDigest(image), isolationRuntime: "runsc" }); };
    const cleanup = status => {
      if (cleaning || settled) return; cleaning = true; clearTimeout(timer); active?.kill();
      if (!containerId) { finish("infrastructure-unavailable"); return; }
      const command = spawn(docker, ["rm", "--force", containerId], { stdio: "ignore", windowsHide: true });
      const deadline = setTimeout(() => { command.kill(); finish("infrastructure-unavailable"); }, 5000);
      command.once("error", () => { clearTimeout(deadline); finish("infrastructure-unavailable"); });
      command.once("close", code => { clearTimeout(deadline); let details = null; if (status === "valid") { try { details = JSON.parse(stdout); } catch { status = "invalid-media"; } } finish(code === 0 ? status : "infrastructure-unavailable", details); });
    };
    timer = setTimeout(() => cleanup("infrastructure-unavailable"), 10000);
    const creation = spawn(docker, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); active = creation;
    let created = ""; creation.stdout.on("data", chunk => { if (created.length < 256) created += chunk; }); creation.stderr.resume();
    creation.once("error", () => finish("infrastructure-unavailable"));
    creation.once("close", code => {
      if (settled || cleaning) return;
      if (code !== 0 || !/^[a-f0-9]{64}$/.test(created.trim())) { finish("infrastructure-unavailable"); return; }
      containerId = created.trim(); clearTimeout(timer); timer = setTimeout(() => { reason = "timeout"; cleanup(reason); }, 15000);
      const execution = spawn(docker, ["start", "--attach", "--interactive", containerId], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }); active = execution;
      const capture = (chunk, channel) => { outputBytes += chunk.length; if (outputBytes > 16384) { reason = "invalid-media"; cleanup(reason); return; } if (channel === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8"); };
      execution.stdout.on("data", chunk => capture(chunk, "stdout")); execution.stderr.on("data", chunk => capture(chunk, "stderr")); execution.stdin.on("error", () => {});
      execution.once("error", () => cleanup("infrastructure-unavailable")); execution.once("close", exit => cleanup(reason || (exit === 0 && !stderr.trim() ? "valid" : "invalid-media")));
      execution.stdin.end(bytes);
    });
  });
}
