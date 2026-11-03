import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { transform } from "esbuild";
import { authoredActivities } from "../../src/lib/coding/learning/catalogue";
import type { PracticalArtifact } from "../../src/lib/coding/learning/types";

async function main() {
  const directory = `artifacts/coding-source-syntax/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const python: Array<{ id: string; source: string }> = [], javascript: Array<{ id: string; source: string }> = [], seen = new Set<string>();
  function include(id: string, artifact: PracticalArtifact) {
    if (artifact.type !== "source") return;
    const parts = [{ name: "entry", language: artifact.language, source: artifact.source }, ...Object.entries(artifact.projectFiles ?? {}).map(([name, source]) => ({ name, source, language: name.endsWith(".py") ? "python" : name.endsWith(".js") ? "javascript" : "data" }))];
    for (const part of parts) {
      if (!["python", "javascript"].includes(part.language)) continue;
      const hash = createHash("sha256").update(part.language + part.source).digest("hex"); if (seen.has(hash)) continue; seen.add(hash);
      (part.language === "python" ? python : javascript).push({ id: `${id}/${part.name}`, source: part.source });
    }
  }
  for (const activity of authoredActivities) {
    include(activity.inventoryId, activity.reference); include(`${activity.inventoryId}/debug-repair`, activity.debugReference);
    for (const [index, variant] of activity.independent.entries()) include(`${activity.inventoryId}/independent-${index + 1}`, variant.reference);
  }
  const errors: Array<{ id: string; message: string }> = [];
  for (const part of javascript) try { await transform(part.source, { loader: "js", target: "es2022", logLevel: "silent" }); } catch { errors.push({ id: part.id, message: "JavaScript reference syntax is invalid; no source was executed." }); }
  if (python.length) {
    const parser = "import ast,json,sys\nerrors=[]\nfor item in json.load(sys.stdin):\n try: ast.parse(item['source'],filename=item['id'])\n except SyntaxError as error: errors.append({'id':item['id'],'message':'Python syntax error at line '+str(error.lineno)+': '+error.msg})\nprint(json.dumps(errors))";
    const parsed = spawnSync("wsl", ["-d", "Ubuntu", "--exec", "/usr/bin/env", "-i", "PATH=/usr/bin:/bin", "/usr/bin/python3", "-I", "-S", "-c", parser], { input: JSON.stringify(python), encoding: "utf8", windowsHide: true, timeout: 45000, maxBuffer: 1048576 });
    if (parsed.error || parsed.status !== 0) errors.push({ id: "python-parser", message: "The syntax-only parser was unavailable; Python references are not syntax-verified." });
    else errors.push(...JSON.parse(parsed.stdout));
  }
  const result = { directory, authoredActivities: authoredActivities.length, uniquePythonReferences: python.length, uniqueJavaScriptReferences: javascript.length, errors, passed: errors.length === 0, learnerCodeExecuted: false, functionalVerificationClaim: false, isolationVerificationClaim: false };
  writeFileSync(`${directory}/result.json`, JSON.stringify(result, null, 2), { flag: "wx" }); console.log(JSON.stringify(result));
  if (errors.length) process.exitCode = 1;
}
main().catch(() => { console.error("Syntax-only verification did not complete; no reference execution is claimed."); process.exitCode = 1; });
