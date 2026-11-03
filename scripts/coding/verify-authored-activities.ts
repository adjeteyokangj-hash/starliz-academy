import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { authoredActivities, activityContentHash, expectedActivityCounts } from "../../src/lib/coding/learning/catalogue";
import { executePractical } from "../../src/lib/coding/learning/runtime";
import { executeSource, ExecutionUnavailable } from "../../src/lib/coding/learning/source-execution";
import { checkExecution } from "../../src/lib/coding/learning/checks";
import { localIsolatedExecutor } from "./local-isolated-executor";
import { streamIsolatedExecutor } from "./stream-isolated-executor";
import { curriculumRuntimeHash, practicalExecutionHash } from "./verify-curriculum-runtime";

async function main() {
  const runId = randomUUID(), directory = `artifacts/coding-curriculum-verification/${runId}`;
  mkdirSync(directory, { recursive: true });
  const evidence = `${directory}/actual-jobs.jsonl`, results = `${directory}/activities.jsonl`;
  const executionHash = await practicalExecutionHash();
  writeFileSync(evidence, JSON.stringify({ runId, requestedSourceIsolationRuntime: "runsc", nativeExecution: "trusted deterministic workbench engines", runtimeHash: curriculumRuntimeHash(), practicalExecutionHash: executionHash }) + "\n", { flag: "wx" });
  const selected = process.argv.filter((argument) => argument.startsWith("--activity=")).map((argument) => argument.slice(11));
  const authorDrafts = process.argv.includes("--author-drafts");
  if (authorDrafts && !selected.length) throw new Error("Author-draft verification requires explicit activity identifiers and cannot seal a curriculum release.");
  const pool = authoredActivities;
  const unknown = selected.filter((id) => !pool.some((activity) => activity.inventoryId === id || activity.id === id));
  if (unknown.length) throw new Error(`Unknown verification activity identifiers: ${unknown.join(", ")}. No practical jobs were started.`);
  const activities = selected.length ? pool.filter((activity) => selected.includes(activity.inventoryId) || selected.includes(activity.id)) : pool;
  if (!activities.length) throw new Error("No authored activities match this verification request.");
  // Native workbenches do not require a Linux process. Initialise a real source
  // transport only when a source program is actually submitted; never substitute
  // a fake interpreter when the isolated host is unavailable.
  const transport: { stream: ReturnType<typeof streamIsolatedExecutor> | null; execute: ReturnType<typeof localIsolatedExecutor> | null } = { stream: null, execute: null };
  const runSource: typeof executeSource = (artifact, input) => {
    if (!transport.execute) transport.execute = process.env.CODING_RUNNER_PERSISTENT_TEST_TRANSPORT === "1"
      ? transport.stream = streamIsolatedExecutor(evidence) : localIsolatedExecutor(evidence);
    return executeSource(artifact, input, transport.execute);
  };
  let passed = 0, tested = 0, interrupted = false;
  let consecutiveUnavailable = 0;
  const unavailableActivities: string[] = [];
  let activeCheck: { inventoryId: string; part: string; caseId: string } | null = null;
  try {
  for (const activity of activities) {
    const checks: Array<{ part: string; caseId: string; passed: boolean; error?: string; failedAssertions?: string[] }> = [];
    try {
    for (const [part, artifact, cases] of [
      ["build", activity.reference, activity.cases], ["practise", activity.reference, activity.practiceCases], ["debug-repair", activity.debugReference, activity.debugCases],
      ...activity.independent.map((variant) => [variant.id, variant.reference, variant.cases] as const),
    ] as const) {
      for (const fixture of cases) {
        activeCheck = { inventoryId: activity.inventoryId, part, caseId: fixture.id };
        const execution = await executePractical(activity.workbench, artifact, fixture.input, runSource);
        const failedAssertions = checkExecution(execution, fixture.assertions).filter((check) => !check.passed).map((check) => check.description);
        checks.push({ part, caseId: fixture.id, passed: execution.ok && !failedAssertions.length,
          ...(!execution.ok ? { error: execution.error } : {}), ...(failedAssertions.length ? { failedAssertions } : {}) });
      }
    }
    activeCheck = { inventoryId: activity.inventoryId, part: "seeded-fault-rejected", caseId: activity.debugCases[0]!.id };
    const faulty = await executePractical(activity.workbench, activity.faulty, activity.debugCases[0]!.input, runSource);
    checks.push({ part: "seeded-fault-rejected", caseId: activity.debugCases[0]!.id, passed: !checkExecution(faulty, activity.debugCases[0]!.assertions).every((check) => check.passed) });
    const ok = checks.every((check) => check.passed);
    appendFileSync(results, JSON.stringify({ runId, activityId: activity.id, inventoryId: activity.inventoryId, kind: activity.kind, workbench: activity.workbench, contentHash: activityContentHash(activity), passed: ok, checks }) + "\n");
    if (ok) passed++;
    tested++; activeCheck = null; consecutiveUnavailable = 0;
    console.log(`${activity.inventoryId}: ${ok ? "PASS" : "FAIL"} (${checks.length} actual practical checks)`);
    } catch (error) {
      interrupted = true;
      const unavailable = error instanceof ExecutionUnavailable;
      appendFileSync(results, JSON.stringify({ runId, activityId: activity.id, inventoryId: activity.inventoryId, kind: activity.kind, workbench: activity.workbench, contentHash: activityContentHash(activity), completed: false, passed: false, status: unavailable ? "infrastructure-unavailable" : "verification-error", interruptedCheck: activeCheck, checks }) + "\n");
      if (!unavailable) throw error;
      unavailableActivities.push(activity.inventoryId); consecutiveUnavailable++;
      console.error(`${activity.inventoryId}: UNVERIFIED (actual isolation infrastructure unavailable; completed checks retained).`);
      // Close only this verifier's private broker. Do not restart WSL, Docker,
      // an existing runtime, or an unrelated application to recover resources.
      await transport.stream?.close(); transport.stream = null; transport.execute = null;
      if (consecutiveUnavailable >= 3) { console.error("Three consecutive activities encountered unavailable infrastructure. Remaining source verification is deferred."); break; }
    }
  }
  } catch {
    interrupted = true;
    console.error("Actual practical verification was interrupted before all selected checks finished. Unfinished activities are not counted as verified.");
  } finally { await transport.stream?.close(); }
  const report = { runId, directory, authorDrafts, selected: activities.length, tested, passed, interrupted, unavailableActivities, ...(interrupted ? { interruptedCheck: activeCheck } : {}), approvedTotal: expectedActivityCounts.total,
    practicalExecutionHash: executionHash,
    completePracticalScopeVerified: !authorDrafts && !interrupted && tested === expectedActivityCounts.total && passed === expectedActivityCounts.total,
    completeScopeVerified: false,
    note: "Actual author practical checks do not verify authenticated progression, model review, original recordings or production readiness, and cannot publish the curriculum." };
  writeFileSync(`${directory}/result.json`, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify(report));
  if (interrupted || passed !== activities.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Curriculum verification failed"); process.exitCode = 1; });
