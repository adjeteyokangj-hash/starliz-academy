import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { containerArguments } from "../../services/coding-runner/container.mjs";
import { validateJob } from "../../services/coding-runner/protocol.mjs";
import { assertLinuxHost, pinnedRuntimeImages, readLinuxHost, repositoryRoot } from "./certification-host";

// Linux certification sequence, from this checkout:
// 1. npx tsx scripts/coding/certification-preflight.ts
// 2. CODING_RUNNER_CONTAINER_TESTS=1 node scripts/coding/world-runner-verification.mjs python
// 3. CODING_RUNNER_CONTAINER_TESTS=1 node scripts/coding/world-runner-verification.mjs javascript
// 4. CODING_RUNNER_CONTAINER_TESTS=1 npx tsx scripts/coding/verify-authored-activities.ts
// 5. Recompute curriculumRuntimeHash() and practicalExecutionHash()
// 6. NODE_ENV=development npx tsx scripts/coding/approve-local-curriculum.ts --apply-development-approval
//    only after new 440-activity evidence matches the practical hash
// 7. NODE_ENV=development npx tsx scripts/coding/verify-local-publication.ts
// 8. NODE_ENV=production npx tsx scripts/coding/verify-local-publication.ts
// 9. npm run build
// Do not write hashes into the seal by hand.

type Language = "python" | "javascript";

export function assertLearnerCap() {
  const job = { jobId: "00000000-0000-4000-8000-000000000001", language: "python" as const, source: "print(1)", stdin: "", timeLimitMs: 5000 };
  if (!validateJob(job)) throw new Error("Learner execution cap rejected a five-second job.");
  if (validateJob({ ...job, timeLimitMs: 5001 })) throw new Error("Learner execution cap exceeds five seconds.");
}

export function assertColdLimits(language: Language, createSeconds: number, readySeconds: number) {
  if (language === "javascript" && createSeconds >= 10) throw new Error("JavaScript container creation exceeded 10 seconds.");
  if (language === "javascript" && readySeconds >= 20) throw new Error("JavaScript interpreter readiness exceeded 20 seconds.");
}

function gitReport(root: string) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout?.trim() ?? "";
  const porcelain = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout ?? "";
  const dirty = porcelain.split("\n").filter(Boolean).length;
  return { head, dirty };
}

function timeReady(language: Language) {
  const images = pinnedRuntimeImages();
  const image = language === "javascript" ? images.javascript : `python@${images.python}`;
  const job = {
    jobId: randomUUID(),
    language,
    source: language === "python" ? "print('python-runner-ok')" : "console.log('javascript-runner-ok')",
    stdin: "",
    timeLimitMs: 4000,
  };
  const started = performance.now();
  const created = spawnSync("/usr/bin/docker", containerArguments(job, image, "runsc"), { encoding: "utf8", timeout: 15000 });
  const createSeconds = (performance.now() - started) / 1000;
  if (created.status !== 0) return { createSeconds, readySeconds: Number.POSITIVE_INFINITY };
  const container = created.stdout.trim();
  const readyStarted = performance.now();
  const child = spawn("/usr/bin/docker", ["start", "--attach", "--interactive", container], { stdio: ["ignore", "pipe", "pipe"] });
  return new Promise<{ createSeconds: number; readySeconds: number }>((resolve) => {
    let ready = false;
    let text = "";
    const finish = (readySeconds: number) => {
      if (ready) return;
      ready = true;
      clearTimeout(timer);
      child.kill();
      spawnSync("/usr/bin/docker", ["rm", "-f", container], { timeout: 15000 });
      resolve({ createSeconds, readySeconds });
    };
    const timer = setTimeout(() => finish(Number.POSITIVE_INFINITY), 25000);
    child.stdout.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
      if (text.includes("__STARLIZ_INTERPRETER_READY__")) finish((performance.now() - readyStarted) / 1000);
    });
    child.once("close", () => { if (!ready) finish((performance.now() - readyStarted) / 1000); });
    child.once("error", () => finish(Number.POSITIVE_INFINITY));
  });
}

function signedCertification(language: Language, root: string) {
  const result = spawnSync("/usr/bin/node", ["scripts/coding/world-runner-verification.mjs", language], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    env: { PATH: "/usr/bin:/usr/sbin:/bin:/sbin", DOCKER_HOST: "unix:///var/run/docker.sock", CODING_RUNNER_CONTAINER_TESTS: "1", NODE_ENV: "test" },
  });
  const passed = result.status === 0 && result.stdout.includes(`"${language}":"passed"`);
  if (!passed) throw new Error(`${language} signed certification failed.`);
}

async function main() {
  if (process.platform !== "linux") throw new Error("Certification platform is unsupported.");
  const root = repositoryRoot();
  const host = readLinuxHost();
  assertLinuxHost(host);
  assertLearnerCap();
  const report = { checkout: root, ...gitReport(root), dockerDataRoot: host.dataRoot, runtimes: host.runtimes, images: pinnedRuntimeImages() };
  console.log(JSON.stringify({ preflight: "host", ...report }));
  for (const language of ["python", "javascript"] as const) {
    const timing = await timeReady(language);
    console.log(JSON.stringify({ preflight: "cold", language, ...timing }));
    assertColdLimits(language, timing.createSeconds, timing.readySeconds);
    signedCertification(language, root);
    console.log(JSON.stringify({ preflight: "signed", language, passed: true }));
  }
  console.log(JSON.stringify({ preflight: "passed", checkout: root }));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/certification-preflight.ts")) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "Certification preflight failed.");
    process.exitCode = 1;
  });
}
