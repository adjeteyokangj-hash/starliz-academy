import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { stop } from "esbuild";
import { authoredActivities, activityContentHash, expectedActivityCounts } from "../../src/lib/coding/learning/catalogue";
import { practicalExecutionHash } from "./verify-curriculum-runtime";

const rowSchema = z.object({ runId: z.string().uuid(), inventoryId: z.string(), contentHash: z.string(), passed: z.boolean(), completed: z.boolean().optional(), checks: z.array(z.object({ part: z.string(), caseId: z.string(), passed: z.boolean() })) });
/** Combines actual completed author checks only. It never publishes content,
 * grants progress, or substitutes practical checks for application verification. */
async function main() {
  const base = "artifacts/coding-curriculum-verification", executionHash = await practicalExecutionHash();
  const candidates = new Map<string, Array<{ runId: string; checks: number; evidence: string }>>();
  const retainedFailures: Array<{ runId: string; activity: string; completed: boolean; failedChecks: number }> = [];
  const ignoredRuns: string[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(base, entry.name), jobs = join(directory, "actual-jobs.jsonl"), results = join(directory, "activities.jsonl");
    if (!existsSync(jobs) || !existsSync(results)) continue;
    // Read only the bounded header; actual job logs may contain sizeable source.
    const { openSync, readSync, closeSync } = await import("node:fs");
    const descriptor = openSync(jobs, "r"), buffer = Buffer.alloc(8192); let count: number;
    try { count = readSync(descriptor, buffer, 0, buffer.length, 0); } finally { closeSync(descriptor); }
    const firstLine = buffer.subarray(0, count).toString("utf8").split("\n")[0];
    let header: { runId?: string; practicalExecutionHash?: string };
    try { header = JSON.parse(firstLine); } catch { ignoredRuns.push(entry.name); continue; }
    if (header.runId !== entry.name || header.practicalExecutionHash !== executionHash) { ignoredRuns.push(entry.name); continue; }
    for (const line of readFileSync(results, "utf8").split("\n").filter(Boolean)) {
      const parsed = rowSchema.safeParse(JSON.parse(line)); if (!parsed.success) throw new Error(`Malformed practical evidence in ${entry.name}.`);
      const row = parsed.data, activity = authoredActivities.find(activity => activity.inventoryId === row.inventoryId);
      if (row.runId !== header.runId || !activity || row.contentHash !== activityContentHash(activity)) continue;
      if (!row.passed || row.completed === false) { retainedFailures.push({ runId: row.runId, activity: row.inventoryId, completed: row.completed !== false, failedChecks: row.checks.filter(check => !check.passed).length }); continue; }
      const expected = [
        ...activity.cases.map(fixture => ["build", fixture.id]),
        ...activity.practiceCases.map(fixture => ["practise", fixture.id]),
        ...activity.debugCases.map(fixture => ["debug-repair", fixture.id]),
        ...activity.independent.flatMap(variant => variant.cases.map(fixture => [variant.id, fixture.id])),
        ["seeded-fault-rejected", activity.debugCases[0]!.id],
      ].map(key => JSON.stringify(key)).sort();
      const actual = row.checks.map(check => JSON.stringify([check.part, check.caseId])).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected) || row.checks.some(check => !check.passed)) throw new Error(`Incomplete claimed pass for ${row.inventoryId} in ${row.runId}.`);
      candidates.set(activity.inventoryId, [...(candidates.get(activity.inventoryId) ?? []), { runId: row.runId, checks: row.checks.length, evidence: results.replaceAll("\\", "/") }]);
    }
  }
  const coverage = authoredActivities.map(activity => ({ inventoryId: activity.inventoryId, contentHash: activityContentHash(activity), passed: candidates.has(activity.inventoryId), evidence: candidates.get(activity.inventoryId) ?? [] }));
  const directory = `artifacts/coding-practical-coverage/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const missing = coverage.filter(activity => !activity.passed).map(activity => activity.inventoryId);
  const report = { practicalExecutionHash: executionHash, approvedActivities: expectedActivityCounts.total, currentAuthoredActivities: authoredActivities.length, verifiedActivities: coverage.length - missing.length, missing, completePracticalCoverage: coverage.length === expectedActivityCounts.total && !missing.length, completeSystemVerified: false, productionReady: false, note: "Current source-bound author practical checks only. Authenticated journeys, model review, media, access, responsive UI and release gates require separate verification. Failed and unavailable attempts remain retained.", retainedFailures, ignoredRuns, coverage };
  writeFileSync(`${directory}/result.json`, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ directory, verifiedActivities: report.verifiedActivities, missing, retainedFailures: retainedFailures.length, completePracticalCoverage: report.completePracticalCoverage, completeSystemVerified: false }));
  if (!report.completePracticalCoverage) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Practical evidence could not be validated."); process.exitCode = 1; }).finally(() => stop());
