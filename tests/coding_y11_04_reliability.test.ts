import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { authoredActivities } from "../src/lib/coding/learning/catalogue";
import { checkExecution } from "../src/lib/coding/learning/checks";
import type { Execution, Json, PracticalArtifact, PracticalCase } from "../src/lib/coding/learning/types";

const year11 = ["Y11.01", "Y11.02", "Y11.03", "Y11.04", "Y11.05", "Y11.06"];
const socketContract = "Actual socket responses preserve the versioned success, refusal and retry contracts";

function pythonCommand() {
  for (const command of ["python", "py"]) {
    const probe = spawnSync(command, ["--version"], { encoding: "utf8" });
    if (probe.status === 0 && !/Microsoft Store/i.test(`${probe.stdout}${probe.stderr}`)) return command;
  }
  throw new Error("Python is required to execute the Y11 reliability reference.");
}

function executePython(artifact: PracticalArtifact, input: Json): Execution {
  if (artifact.type !== "source" || artifact.language !== "python" || artifact.entry !== "solve") throw new Error("Y11 reliability expects the Python solve reference.");
  const command = pythonCommand();
  const directory = mkdtempSync(join(tmpdir(), "starliz-y11-"));
  try {
    for (const [name, content] of Object.entries(artifact.projectFiles ?? {})) writeFileSync(join(directory, name), content);
    writeFileSync(join(directory, "project.py"), artifact.source);
    const script = `import importlib.util,json,os,sys
os.chdir(${JSON.stringify(directory)})
sys.path.insert(0, os.getcwd())
spec=importlib.util.spec_from_file_location("project", ${JSON.stringify(join(directory, "project.py"))})
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
result=module.solve(json.loads(sys.stdin.read()))
files={}
for name in sorted(os.listdir(".")):
    if os.path.isfile(name) and name.endswith((".json",".txt",".csv",".sql",".html",".css")):
        with open(name,encoding="utf-8") as handle: files[name]=handle.read()
print(json.dumps({"result":result,"files":files},allow_nan=False))
`;
    const run = spawnSync(command, ["-c", script], { input: JSON.stringify(input), encoding: "utf8", cwd: directory, timeout: 20000 });
    if (run.status !== 0) throw new Error(run.stderr || run.stdout || "Python reference failed.");
    return { ok: true, output: JSON.parse(run.stdout), trace: [], stdout: "", stderr: "", runtime: "local-python", steps: 1 };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertCase(artifact: PracticalArtifact, fixture: PracticalCase) {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const execution = executePython(artifact, fixture.input);
      const failed = checkExecution(execution, fixture.assertions).filter((check) => !check.passed).map((check) => check.description);
      assert.deepEqual(failed, [], `${fixture.id}: ${failed.join("; ")}`);
      return execution;
    } catch (error) {
      last = error;
      if (!String(error).includes("TimeoutError")) throw error;
    }
  }
  throw last;
}

test("Y11.04 keeps its revision objective and accepts either concurrent winner", () => {
  const activity = authoredActivities.find((item) => item.inventoryId === "Y11.04");
  assert.ok(activity);
  assert.match(activity.objective, /revision|concurrent|stale/i);
  assert.ok(activity.concepts.includes("optimistic concurrency"));
  assert.equal(activity.prediction.correctId, "choice-1");
  assert.equal(activity.cases.length, 2);
  const serial = activity.cases.find((item) => item.id === "Y11.04-reliability-0");
  const concurrent = activity.cases.find((item) => item.id === "Y11.04-reliability-1");
  assert.ok(serial && concurrent);
  assert.equal("equals" in serial.assertions[0]!, true);
  assert.equal("unordered" in concurrent.assertions[0]!, true);
  assert.equal(concurrent.assertions.filter((check) => check.description === socketContract).length, 1);
  assert.ok(concurrent.assertions.some((check) => check.description.includes("one durable request receipt")));
  const execution = assertCase(activity.reference, concurrent);
  const output = execution.output as { result: { http: { responses: Json[] } } };
  const reversed: Execution = { ...execution, output: { ...(execution.output as object), result: { ...output.result, http: { ...output.result.http, responses: [...output.result.http.responses].reverse() } } } };
  assert.deepEqual(checkExecution(reversed, concurrent.assertions).filter((check) => !check.passed), []);
  const duplicated = { ...reversed, output: { ...(reversed.output as object), result: { ...output.result, http: { ...output.result.http, responses: [output.result.http.responses[0], output.result.http.responses[0]] } } } };
  assert.equal(checkExecution(duplicated, concurrent.assertions).some((check) => !check.passed && check.description === socketContract), true);
  for (let attempt = 0; attempt < 8; attempt++) assertCase(activity.reference, concurrent);
  for (const fixture of [...activity.cases, ...activity.practiceCases, ...activity.independent.flatMap((variant) => variant.cases)]) assertCase(activity.reference, fixture);
  const faulty = executePython(activity.faulty, concurrent.input);
  assert.equal(checkExecution(faulty, concurrent.assertions).every((check) => check.passed), false);
});

test("neighbouring Year 11 reliability activities still meet their response contracts", () => {
  for (const inventoryId of year11.filter((id) => id !== "Y11.04")) {
    const activity = authoredActivities.find((item) => item.inventoryId === inventoryId);
    assert.ok(activity, inventoryId);
    assert.equal(activity.cases.every((fixture) => "unordered" in fixture.assertions[0]!), false);
    for (const fixture of [...activity.cases, ...activity.practiceCases, ...activity.independent.flatMap((variant) => variant.cases)]) assertCase(activity.reference, fixture);
  }
});
