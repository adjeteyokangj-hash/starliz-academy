import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pins from "../../src/lib/coding/learning/runtime-pins.json";

const scripts = {
  job: "execute-local-test-job.mjs",
  stream: "stream-local-test-jobs.mjs",
} as const;

export type CertificationScript = keyof typeof scripts;

export type LinuxHostProbe = {
  dockerAvailable: boolean;
  dataRoot: string;
  runtimes: string[];
  images: { python: boolean; javascript: boolean };
};

export type CertificationLaunch = {
  command: string;
  args: string[];
  script: string;
  usesWsl: boolean;
  env?: NodeJS.ProcessEnv;
};

export function repositoryRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export function checkoutScript(kind: CertificationScript, root = repositoryRoot()) {
  const script = resolve(root, "scripts", "coding", scripts[kind]);
  if (!existsSync(script)) throw new Error("The certification script cannot be resolved.");
  const rootReal = realpathSync(root);
  const scriptReal = realpathSync(script);
  const fromRoot = relative(rootReal, scriptReal);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("The certification script is outside the current checkout.");
  return scriptReal;
}

export function assertScriptInsideCheckout(root: string, scriptPath: string) {
  if (!existsSync(root) || !existsSync(scriptPath)) throw new Error("The certification script cannot be resolved.");
  const fromRoot = relative(realpathSync(root), realpathSync(scriptPath));
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("The certification script is outside the current checkout.");
  return realpathSync(scriptPath);
}

export function toWslPath(absolutePath: string) {
  const normalised = absolutePath.replaceAll("\\", "/");
  const drive = /^([A-Za-z]):\/(.*)$/.exec(normalised);
  if (!drive) throw new Error("The certification script cannot be resolved.");
  return `/mnt/${drive[1]!.toLowerCase()}/${drive[2]}`;
}

export function pinnedRuntimeImages() {
  return { python: pins.python, javascript: pins.javascript, sql: pins.sql };
}

export function assertLinuxHost(probe: LinuxHostProbe) {
  if (!probe.dockerAvailable) throw new Error("Docker is unavailable for Linux certification.");
  if (!probe.dataRoot.trim()) throw new Error("Docker data root is unavailable.");
  if (!probe.runtimes.includes("runsc")) throw new Error("runsc is not registered on the Linux Docker daemon.");
  if (!probe.images.python) throw new Error("Pinned Python image is missing.");
  if (!probe.images.javascript) throw new Error("Pinned JavaScript image is missing.");
}

export function readLinuxHost(): LinuxHostProbe {
  let info = "";
  try {
    info = execFileSync("/usr/bin/docker", ["info", "--format", "{{.DockerRootDir}}\n{{range $name, $runtime := .Runtimes}}{{$name}}\n{{end}}"], { encoding: "utf8", timeout: 20000 });
  } catch {
    return { dockerAvailable: false, dataRoot: "", runtimes: [], images: { python: false, javascript: false } };
  }
  const [dataRoot = "", ...runtimes] = info.split("\n").map(line => line.trim()).filter(Boolean);
  const present = (digest: string) => {
    try {
      execFileSync("/usr/bin/docker", ["image", "inspect", digest, "--format", "{{.Id}}"], { stdio: "ignore", timeout: 20000 });
      return true;
    } catch {
      return false;
    }
  };
  return { dockerAvailable: true, dataRoot, runtimes, images: { python: present(pins.python), javascript: present(pins.javascript) } };
}

function windowsEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = ["SystemRoot", "WINDIR", "PATH", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP"];
  return { ...Object.fromEntries(kept.flatMap(key => source[key] ? [[key, source[key]!]] : [])), NODE_ENV: "test", WSLENV: "" };
}

export function isolationLaunch(kind: CertificationScript, options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  root?: string;
  probe?: LinuxHostProbe;
} = {}): CertificationLaunch {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (env.CODING_RUNNER_CONTAINER_TESTS !== "1") throw new Error("Explicit authorised isolation verification is required.");
  if (platform !== "win32" && platform !== "linux") throw new Error("Certification platform is unsupported.");
  const script = checkoutScript(kind, options.root ?? repositoryRoot());
  if (platform === "linux") {
    assertLinuxHost(options.probe ?? readLinuxHost());
    return {
      command: "/usr/bin/node",
      args: [script],
      script,
      usesWsl: false,
      env: { PATH: "/usr/bin:/usr/sbin:/bin:/sbin", DOCKER_HOST: "unix:///var/run/docker.sock", CODING_RUNNER_CONTAINER_TESTS: "1", NODE_ENV: "test" },
    };
  }
  const linuxScript = toWslPath(script);
  const args = kind === "stream"
    ? ["-d", "Ubuntu", "--exec", "/usr/bin/env", "-i", "PATH=/usr/bin:/usr/sbin:/bin:/sbin", "DOCKER_HOST=unix:///var/run/docker.sock", "CODING_RUNNER_CONTAINER_TESTS=1", "/usr/bin/node", linuxScript]
    : ["-d", "Ubuntu", "--exec", "/usr/bin/env", "CODING_RUNNER_CONTAINER_TESTS=1", "/usr/bin/node", linuxScript];
  return { command: "wsl", args, script: linuxScript, usesWsl: true, env: kind === "stream" ? windowsEnvironment(env) : undefined };
}
