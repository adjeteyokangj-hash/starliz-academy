import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { containerArguments } from "../services/coding-runner/container.mjs";
import { validateJob } from "../services/coding-runner/protocol.mjs";
import { assertColdLimits, assertLearnerCap } from "../scripts/coding/certification-preflight";
import { assertLinuxHost, assertScriptInsideCheckout, checkoutScript, isolationLaunch, pinnedRuntimeImages, repositoryRoot, toWslPath, type LinuxHostProbe } from "../scripts/coding/certification-host";

const env = { CODING_RUNNER_CONTAINER_TESTS: "1" };
const ready: LinuxHostProbe = {
  dockerAvailable: true,
  dataRoot: "/var/lib/docker",
  runtimes: ["runc", "runsc"],
  images: { python: true, javascript: true },
};

test("Linux certification uses this checkout and does not spawn WSL", () => {
  const launch = isolationLaunch("job", { platform: "linux", env, probe: ready });
  const script = checkoutScript("job");
  assert.equal(launch.usesWsl, false);
  assert.equal(launch.command, "/usr/bin/node");
  assert.deepEqual(launch.args, [script]);
  assert.equal(launch.script, script);
  assert.equal(launch.args.includes("wsl"), false);
  assert.equal(script.endsWith("scripts/coding/execute-local-test-job.mjs") || script.endsWith("scripts\\coding\\execute-local-test-job.mjs"), true);
  assert.equal(script.includes("Documents"), false);
  assert.equal(launch.env?.CODING_RUNNER_CONTAINER_TESTS, "1");
  assert.equal(launch.env?.DOCKER_HOST, "unix:///var/run/docker.sock");
});

test("the persistent Linux transport also stays inside this checkout", () => {
  const launch = isolationLaunch("stream", { platform: "linux", env, probe: ready });
  assert.equal(launch.usesWsl, false);
  assert.equal(launch.command, "/usr/bin/node");
  assert.equal(launch.args[0], checkoutScript("stream"));
  assert.equal(String(launch.args[0]).includes("stream-local-test-jobs.mjs"), true);
});

test("Windows certification keeps the WSL launch and resolves the current checkout", () => {
  const launch = isolationLaunch("job", { platform: "win32", env });
  const expected = toWslPath(checkoutScript("job"));
  assert.equal(launch.usesWsl, true);
  assert.equal(launch.command, "wsl");
  assert.equal(launch.args.at(-1), expected);
  assert.equal(expected.startsWith("/mnt/"), true);
  assert.equal(expected.includes("Documents/Projects/starliz-academy"), false);
  assert.equal(launch.args.includes("/usr/bin/node"), true);
  const stream = isolationLaunch("stream", { platform: "win32", env });
  assert.equal(stream.usesWsl, true);
  assert.equal(stream.args.at(-1), toWslPath(checkoutScript("stream")));
  assert.equal(stream.args.includes("DOCKER_HOST=unix:///var/run/docker.sock"), true);
  assert.equal(stream.env?.NODE_ENV, "test");
});

test("a script outside the current checkout is rejected", () => {
  const outside = mkdtempSync(join(tmpdir(), "starliz-cert-"));
  const foreign = join(outside, "execute-local-test-job.mjs");
  writeFileSync(foreign, "// other checkout\n");
  assert.throws(() => assertScriptInsideCheckout(repositoryRoot(), foreign), /outside the current checkout/);
  assert.throws(() => assertScriptInsideCheckout(repositoryRoot(), join(repositoryRoot(), "missing-cert-script.mjs")), /cannot be resolved/);
});

test("Linux certification fails closed without Docker, runsc, or a pinned image", () => {
  assert.throws(() => isolationLaunch("job", { platform: "linux", env, probe: { ...ready, dockerAvailable: false } }), /Docker is unavailable/);
  assert.throws(() => isolationLaunch("job", { platform: "linux", env, probe: { ...ready, dataRoot: " " } }), /data root is unavailable/);
  assert.throws(() => isolationLaunch("job", { platform: "linux", env, probe: { ...ready, runtimes: ["runc"] } }), /runsc is not registered/);
  assert.throws(() => isolationLaunch("job", { platform: "linux", env, probe: { ...ready, images: { python: false, javascript: true } } }), /Pinned Python image is missing/);
  assert.throws(() => isolationLaunch("job", { platform: "linux", env, probe: { ...ready, images: { python: true, javascript: false } } }), /Pinned JavaScript image is missing/);
  assert.throws(() => assertLinuxHost({ ...ready, runtimes: ["runc"] }), /runsc is not registered/);
  assert.equal(isolationLaunch("job", { platform: "linux", env, probe: ready }).args.some(arg => arg === "runc"), false);
});

test("unsupported platforms and unauthorised runs are refused", () => {
  assert.throws(() => isolationLaunch("job", { platform: "darwin", env, probe: ready }), /Certification platform is unsupported/);
  assert.throws(() => isolationLaunch("job", { platform: "linux", env: {}, probe: ready }), /Explicit authorised isolation verification is required/);
});

test("pinned images and runner security limits stay unchanged", () => {
  const pins = pinnedRuntimeImages();
  assert.equal(pins.python, "sha256:b18b261e1b4974b4f321451ad5251ded85abb22c2b8b262da527dda1d031ab30");
  assert.equal(pins.javascript, "sha256:4dda2383bfc88c245be66c59a6f7cebbdd593111c349d1f34c3e43ae179e3457");
  assert.equal(pins.sql, pins.python);
  const job = () => ({ jobId: randomUUID(), language: "python" as const, source: "print(1)", stdin: "", timeLimitMs: 1000 });
  const args = containerArguments(job(), `python@${pins.python}`);
  for (const flag of ["--runtime", "--network=none", "--read-only", "--user=65534:65534", "--memory=128m", "--memory-swap=128m", "--cpus=0.5", "--pids-limit=32"]) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf("--runtime") + 1], "runsc");
  assert.equal(validateJob({ ...job(), timeLimitMs: 5000 })?.timeLimitMs, 5000);
  assert.equal(validateJob({ ...job(), timeLimitMs: 5001 }), null);
  assertLearnerCap();
  assert.doesNotThrow(() => assertColdLimits("javascript", 9.9, 19.9));
  assert.throws(() => assertColdLimits("javascript", 10, 1), /creation exceeded 10 seconds/);
  assert.throws(() => assertColdLimits("javascript", 1, 20), /readiness exceeded 20 seconds/);
});
