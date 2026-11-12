import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("Practical evidence directory is required.");
const root = resolve(directory);
const result = JSON.parse(readFileSync(resolve(root, "result.json"), "utf8")) as {
  runId: string; tested: number; passed: number; completePracticalScopeVerified: boolean; practicalExecutionHash: string;
};
const header = JSON.parse(readFileSync(resolve(root, "actual-jobs.jsonl"), "utf8").split(/\r?\n/, 1)[0] ?? "{}") as { practicalExecutionHash?: string };
if (!result.completePracticalScopeVerified || result.tested !== 440 || result.passed !== 440) throw new Error("Fresh practical evidence does not cover all 440 activities.");
if (!/^[a-f0-9]{64}$/.test(result.practicalExecutionHash) || result.practicalExecutionHash !== header.practicalExecutionHash) throw new Error("Fresh practical evidence does not carry one execution hash.");
const activities = readFileSync(resolve(root, "activities.jsonl"), "utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as { inventoryId?: string; contentHash?: string; passed?: boolean; checks?: unknown[]; runId?: string });
if (activities.length !== 440 || activities.some(activity => !activity.inventoryId || !activity.contentHash || activity.passed !== true || !activity.checks?.length)) throw new Error("Fresh practical evidence contains an incomplete activity.");
const index = {
  verifiedActivities: 440,
  uniquePracticalChecks: activities.reduce((sum, activity) => sum + (activity.checks?.length ?? 0), 0),
  practicalExecutionHash: result.practicalExecutionHash,
  completePracticalCoverage: true,
  completeSystemVerified: false,
  productionReady: false,
  sourceCheckout: "current",
  activities: activities.map(activity => ({ inventoryId: activity.inventoryId, contentHash: activity.contentHash, passed: true, checks: activity.checks?.length, resultFile: "activities.jsonl", runId: result.runId })),
};
const evidencePath = resolve(root, "activity-index.json");
writeFileSync(evidencePath, JSON.stringify(index, null, 2) + "\n");
console.log(evidencePath);
