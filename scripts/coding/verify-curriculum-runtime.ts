import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import release from "../../src/lib/coding/learning/release-manifest.json";
import build from "../../src/lib/coding/learning/runtime-build.json";
import { validateReleaseSeal } from "../../src/lib/coding/learning/catalogue";
import { build as analyseBuild } from "esbuild";

const root = resolve(typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url)), "../..");
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(ts|tsx|mjs|mts)$/.test(entry.name) && !entry.name.includes(" - Copy.") ? [path] : [];
  });
}
export function curriculumRuntimeHash() {
  // Publication must also become stale when an ownership, assistance, access
  // or provider boundary changes, including the frozen-evidence readers.
  const directories = ["src/lib/coding", "services/coding-runner", "src/components/coding", "src/app/student/coding", "src/app/api/student/coding", "src/app/api/parent/coding", "src/app/api/admin/coding", "src/app/api/teacher/coding", "src/lib/coach"];
  const shared = ["src/lib/api_guard.ts", "src/lib/auth.ts", "src/lib/auth_sessions.ts", "src/lib/activeChild.ts", "src/lib/parent_scope.ts", "src/lib/admin-permissions.ts", "src/lib/db.ts", "src/lib/api-key-config.ts", "src/lib/subscriptions/enforcement.ts", "src/lib/subscriptions/learning-access.ts", "src/lib/schools/licensing.ts", "src/lib/schools/short-learning-bookings.ts", "src/lib/schools/support-eligibility.ts", "src/app/api/coach/route.ts", "supabase/functions/coding-execution/index.js", "prisma/schema.prisma", "package.json", "package-lock.json"];
  const paths = [...new Set([...directories.flatMap((directory) => files(resolve(root, directory))), ...shared.map((file) => resolve(root, file))])].sort();
  const hash = createHash("sha256");
  for (const path of paths) hash.update(relative(root, path).replaceAll("\\", "/")).update("\0").update(readFileSync(path)).update("\0");
  hash.update(readFileSync(resolve(root, "services/coding-runner/Dockerfile.dom")));
  hash.update(readFileSync(resolve(root, "services/coding-runner/Dockerfile.media")));
  hash.update(readFileSync(resolve(root, "services/coding-runner/media-validate.py")));
  hash.update(readFileSync(resolve(root, "src/lib/coding/learning/runtime-pins.json")));
  return hash.digest("hex");
}
/** Author practical evidence has a narrower scope than a release. Hash the
 * actual executor import graph and pinned dependencies so an unrelated lesson
 * edit need not rerun unchanged practical programs. Full publication still
 * requires curriculumRuntimeHash(), all activity hashes and separate app UAT. */
export async function practicalExecutionHash() {
  const analysed = await analyseBuild({ absWorkingDir: root, entryPoints: ["src/lib/coding/learning/runtime.ts"], bundle: true, packages: "external", platform: "node", write: false, metafile: true, logLevel: "silent" });
  const graph = Object.keys(analysed.metafile!.inputs).map(path => resolve(root, path));
  if (!graph.includes(resolve(root, "src/lib/coding/learning/source-execution.ts")) || !graph.includes(resolve(root, "src/lib/coding/learning/visual-workspace.ts"))) throw new Error("The practical executor dependency graph is incomplete.");
  const extra = ["package-lock.json", "services/coding-runner/container.mjs", "services/coding-runner/server.mjs", "services/coding-runner/protocol.mjs", "services/coding-runner/Dockerfile.dom", "services/coding-runner/Dockerfile.media", "services/coding-runner/media-validate.py", "src/lib/coding/learning/runtime-pins.json"];
  const paths = [...new Set([...graph, ...extra.map(path => resolve(root, path))])].sort(), hash = createHash("sha256");
  for (const path of paths) hash.update(relative(root, path).replaceAll("\\", "/")).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
}
const actual = curriculumRuntimeHash();
if (!release.verificationRun && !Object.keys(release.activities).length) {
  console.log("Expanded Coding curriculum remains unpublished; no completion claim or release seal exists.");
} else {
  if (actual !== build.runtimeHash || release.verificationRun !== build.verificationRun || !validateReleaseSeal(release, actual)) throw new Error("The Coding release does not match its verified curriculum and execution sources.");
  console.log("All 440 activity hashes and the verified runtime match this build.");
}
