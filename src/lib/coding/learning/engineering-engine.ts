import { z } from "zod";
import { createHash } from "node:crypto";
import { executeSource, ExecutionUnavailable } from "./source-execution";
import { sameJson } from "./checks";
import type { Execution, Json } from "./types";
import { privacyIssues } from "./studio-engines";

import { engineeringDocumentSchema, engineeringFileName as fileName, engineeringFilesSchema, engineeringFixtureSchema as fixtureSchema, engineeringVersionId as id } from "./engineering-contract";
export { engineeringDocumentSchema, type EngineeringDocument } from "./engineering-contract";

export async function executeEngineering(artifact: unknown, input: unknown, runSource: typeof executeSource = executeSource): Promise<Execution> {
  const runtime = "starliz-engineering-1.0.0", trace: Json[] = [];
  try {
    const document = engineeringDocumentSchema.parse(artifact), fixture = fixtureSchema.parse(input);
    let current = { ...(fixture.initialFiles ?? document.files) };
    const originalVersions = fixture.initialVersions ?? document.versions;
    const history = originalVersions.map((version) => ({ ...version, files: { ...version.files } }));
    if (new Set(history.map((version) => version.id)).size !== history.length) throw new Error("Version identifiers must be unique.");
    const canView = document.permissions.viewers.includes(fixture.role), canEdit = canView && document.permissions.editors.includes(fixture.role);
    let denied = 0, changes = 0, restoredVersion = "";
    for (const action of document.actions) {
      if (!canEdit) { denied++; trace.push({ action: action.op, status: "denied", role: fixture.role }); continue; }
      if (action.op === "edit" || action.op === "merge") {
        if (!fileName.safeParse(action.target).success) throw new Error("Use a supported project filename without directories.");
        current[action.target] = action.content; engineeringFilesSchema.parse(current); changes++;
      } else if (action.op === "snapshot") {
        if (!id.safeParse(action.target).success || history.some((version) => version.id === action.target)) throw new Error("Choose a new version identifier; existing versions are preserved.");
        history.push({ id: action.target, author: action.author, files: { ...current } });
      } else {
        const version = history.find((candidate) => candidate.id === action.target);
        if (!version) throw new Error("That project version does not exist.");
        current = { ...version.files }; restoredVersion = version.id; changes++;
      }
      trace.push({ action: action.op, target: action.target, author: action.author, status: "applied", fileCount: Object.keys(current).length, historyCount: history.length });
    }
    const taskMap = new Map(document.tasks.map((task) => [task.id, task]));
    if (taskMap.size !== document.tasks.length || document.tasks.some((task) => task.dependsOn.some((dependency) => !taskMap.has(dependency)))) throw new Error("Task identifiers must be unique and dependencies must exist.");
    const order: string[] = [], pending = new Set(taskMap.keys());
    while (pending.size) {
      const next = [...pending].find((key) => taskMap.get(key)!.dependsOn.every((dependency) => order.includes(dependency)));
      if (!next) throw new Error("The task dependencies form a cycle. Break the circular dependency.");
      pending.delete(next); order.push(next);
    }
    let execution: Execution | null = null;
    const estimatesComplete = document.tasks.length > 0 && document.tasks.every(task => typeof task.effort === "number");
    const estimatedEffort = estimatesComplete ? document.tasks.reduce((sum, task) => sum + task.effort!, 0) : null;
    const pathEffort = new Map<string, number>();
    if (estimatesComplete) for (const key of order) {
      const task = taskMap.get(key)!;
      pathEffort.set(key, task.effort! + Math.max(0, ...task.dependsOn.map(dependency => pathEffort.get(dependency)!)));
    }
    const testResults: Json[] = [];
    if (document.run && canView) {
      const source = current[document.entryFile];
      if (source === undefined) throw new Error("The selected entry file is missing.");
      const projectFiles = Object.fromEntries(Object.entries(current).filter(([name]) => name !== document.entryFile));
      execution = await runSource({ type: "source", language: document.language, source, projectFiles, entry: "solve" }, fixture.input);
      for (const test of document.tests) {
        const run = await runSource({ type: "source", language: document.language, source, projectFiles, entry: "solve" }, test.input);
        const actual = run.output && typeof run.output === "object" && !Array.isArray(run.output) ? run.output.result ?? null : null;
        testResults.push({ name: test.name, passed: run.ok && sameJson(actual, test.expected), actual, expected: test.expected });
      }
    }
    const hash = createHash("sha256").update(JSON.stringify(current)).digest("hex");
    const selected = history.find((version) => version.id === document.selectedVersion);
    const handover = document.handover;
    return { ok: true, output: { files: canView ? current : {}, fileHash: canView ? hash : null, denied, changes, canEdit, canView,
      role: fixture.role, historyCount: history.length, history: canView ? history : [], originalPreserved: history.every((version, index) => sameJson(version, originalVersions[index] ?? version)),
      restoredCorrectVersion: Boolean(restoredVersion === fixture.expectedVersion && selected && selected.id === fixture.expectedVersion && sameJson(current, selected.files)),
      taskOrder: order, needsExplicit: document.tasks.length > 0 && document.tasks.every((task) => task.need.trim().length > 10 && task.criterion.measure.trim().length > 3),
      estimatesComplete, estimatedEffort, criticalPathEffort: estimatesComplete ? Math.max(0, ...pathEffort.values()) : null,
      milestoneBudget: document.milestoneBudget ?? null, budgetFits: estimatedEffort !== null && document.milestoneBudget !== undefined ? estimatedEffort <= document.milestoneBudget : null,
      testResults, allTestsPass: testResults.length > 0 && testResults.every((test) => (test as { passed: boolean }).passed),
      executionPassed: execution?.ok ?? false, execution: execution?.output ?? null,
      privacySafe: privacyIssues(current).length === 0 && !document.permissions.viewers.includes("anonymous"),
      permittedSources: document.sources.every((source) => source.licence !== "restricted" && (source.licence !== "CC-BY" || Boolean(source.creator.trim() && source.credit.trim()))),
      purpose: document.purpose, audience: document.audience, notes: document.notes,
      reproducibleHandover: [handover.setup, handover.test, handover.rollback, handover.limitation, handover.nextLearning].every((field) => field.trim().length > 10),
    }, trace, stdout: execution?.stdout ?? "", stderr: execution?.stderr ?? "", runtime: execution ? `${runtime}/${execution.runtime}` : runtime, steps: trace.length + (execution?.steps ?? 0) };
  } catch (error) {
    if (error instanceof ExecutionUnavailable) throw error;
    return { ok: false, output: null, trace, stdout: "", stderr: "", error: error instanceof z.ZodError ? "Check the engineering workspace's files, version references and permission values." : error instanceof Error ? error.message : "The engineering project could not run.", runtime, steps: trace.length };
  }
}
