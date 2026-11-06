import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { authoredActivities, activityContentHash } from '../../src/lib/coding/learning/catalogue';
import { hasVisualReview } from '../../src/lib/coding/learning/visual-review';
import { remainingReviewCriterion, hasExtendedReview } from '../../src/lib/coding/learning/extended-review';
import { extendedReviewMaterial, reviewUnits } from '../../src/lib/coding/learning/review-material';
import { checkExecution } from '../../src/lib/coding/learning/checks';
import { curriculumRuntimeHash, practicalExecutionHash } from './verify-curriculum-runtime';
import type { Execution, PracticalArtifact, Json } from '../../src/lib/coding/learning/types';

type Baseline = { id: string; status: string; completionDependency?: Record<string, unknown>; [key: string]: unknown };
type Validated = { id: string; variant: string; materialHash?: string; criteria?: string[] };
type Executed = { id: string; variant: string; contentHash: string; executorHash: string; artifact: PracticalArtifact; input: Json; run: Execution };
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const lines = <T>(path: string): T[] => readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));

async function main() {
  // First run CODING_RUNNER_CONTAINER_TESTS=1 node --import tsx --test
  // tests/coding_extended_review.test.ts. Partial authoring is not validation.
  const argument = process.argv.indexOf('--validation-dir');
  assert(argument >= 0 && process.argv[argument + 1], 'Provide --validation-dir artifacts/coding-review-pass/validation-UUID after the full test run');
  const directory = resolve(process.argv[argument + 1]!);
  assert(/^validation-[a-f0-9-]+$/.test(relative(resolve('artifacts/coding-review-pass'), directory)), 'Use a completed local Review validation directory');
  const run = json<{ isolatedExecutionRequested: boolean; sourceFingerprint: string; materialHash: string }>(`${directory}/run.json`);
  assert(run.isolatedExecutionRequested); assert.equal(run.sourceFingerprint, curriculumRuntimeHash(), 'Review evidence is stale');
  const materialHash = createHash('sha256').update(readFileSync('src/lib/coding/learning/review-material.ts')).digest('hex'); assert.equal(run.materialHash, materialHash);
  const log = readFileSync('artifacts/coding-review-pass/final-review-validation.log', 'utf8');
  for (const expected of ['tests 443','pass 443','fail 0','skipped 0']) assert(log.includes(expected), `Final test log lacks ${expected}`);
  const baseline = json<Baseline[]>('artifacts/coding-review-pass/coverage-before.json');
  assert.equal(baseline.length, 440); assert.equal(baseline.filter(row => row.status === 'verified-local-review').length, 49);
  const verified = lines<Validated>(`${directory}/validated.jsonl`), original = lines<Validated>(`${directory}/original-validated.jsonl`), executions = lines<Executed>(`${directory}/executions.jsonl`);
  const executorHash = await practicalExecutionHash();
  const conditional = new Set(['Y4.16','Y4.17','Y4.18','P-Y4-3','Y6.22','Y8.21','Y9.19','Y10.19','Y11.13','Y9.22','Y9.23','Y10.21']);
  const evidenceDirectory = relative(process.cwd(), directory).replaceAll('\\', '/');
  const results = authoredActivities.map(activity => {
    const before = baseline.find(row => row.id === activity.inventoryId); assert(before);
    const preserved = before.status === 'verified-local-review', supported = hasVisualReview(activity), proof = preserved ? original : verified;
    if (supported) for (const variant of activity.independent) {
      const rows = proof.filter(row => row.id === activity.inventoryId && row.variant === variant.id); assert.equal(rows.length, 1, `${activity.inventoryId}/${variant.id}: missing or repeated proof`);
      if (!preserved) {
        assert.equal(rows[0]!.materialHash, materialHash); assert.deepEqual(rows[0]!.criteria, extendedReviewMaterial[activity.inventoryId]);
        const evidence = executions.filter(row => row.id === activity.inventoryId && row.variant === variant.id); assert.equal(evidence.length, 1);
        assert.equal(evidence[0]!.contentHash, activityContentHash(activity)); assert.equal(evidence[0]!.executorHash, executorHash);
        assert.deepEqual(evidence[0]!.artifact, variant.reference); assert.deepEqual(evidence[0]!.input, variant.cases[0]!.input);
        assert(checkExecution(evidence[0]!.run, variant.cases[0]!.assertions).every(check => check.passed));
      }
    }
    if (!supported) assert(remainingReviewCriterion(activity), `${activity.inventoryId}: exact unresolved criterion missing`);
    const dependency = before.completionDependency;
    return {
      ...before, status: supported ? 'verified-local-review' : 'requires-permitted-explanation', variants: supported ? activity.independent.length : 0,
      objective: activity.objective, originalValidatedPath: preserved,
      ...(dependency ? { completionDependency: { ...dependency, planningCategory: dependency.category, validatedDeterministicEquivalent: supported && !conditional.has(activity.inventoryId), validatedLocalReviewPath: supported, conditionalSemanticScope: conditional.has(activity.inventoryId),
        eligibleGroups: supported ? 'All ages for the verified local Review scope, including under-13 and unknown-age learners without verified provider ZDR. Existing access and independence requirements apply. Permitted provider review remains unchanged.' : dependency.eligibleGroups,
        permittedCurrentPath: supported ? 'Server-evaluated local evidence and reasoning review for restricted-provider learners; permitted provider explanation review remains under the existing policy.' : dependency.permittedCurrentPath,
        blockedGroups: supported ? conditional.has(activity.inventoryId) ? 'A new free-form semantic claim outside the complete audited scenario still needs permitted semantic review.' : 'No provider dependency for local Review. Practical, independence, ownership and prerequisite rules still apply.' : dependency.blockedGroups } } : {}),
      ...(supported ? { requirement: undefined, validation: { directory: evidenceDirectory, file: preserved ? 'original-validated.jsonl' : 'validated.jsonl', variants: activity.independent.map(variant => variant.id), practicalExecutorHash: executorHash, currentRuntimeHash: run.sourceFingerprint },
        localScope: conditional.has(activity.inventoryId) ? 'Complete locally audited semantic scenario only. Layout, implementation, task ordering and defensible priorities may vary within practical constraints. New free-form meanings require permitted explanation review.' : preserved ? 'Preserved original objective-specific rubric.' : 'Actual independent result plus authored causal, consequential-choice and counterexample criteria; every answer required.' }
        : { requirement: `Objective: ${activity.objective} Missing assessment: ${remainingReviewCriterion(activity)}`, unresolvedCriterion: remainingReviewCriterion(activity), requiredIndependentTasks: activity.independent.map(variant => ({ variant: variant.id, task: variant.task })) }),
      ...(!preserved ? { reviewCriteria: (extendedReviewMaterial[activity.inventoryId] ?? []).map(key => ({ key, criterion: reviewUnits[key]!.criterion, prompts: reviewUnits[key]!.questions.map(question => question[0]), evaluatedBy: supported ? 'All authored choices server-evaluated; correct result with wrong conceptual answer fails.' : 'Supplementary authoring only; cannot establish the unresolved required criterion.' })),
        practicalEvidence: activity.independent.map(variant => ({ variant: variant.id, task: variant.task, cases: variant.cases.map(sample => ({ id: sample.id, criteria: sample.assertions.map(assertion => ({ path: assertion.path, criterion: assertion.description })) })) })),
        evidenceBoundary: 'Current first-case result supplies observation questions. The mastery transition separately reruns every independent practical case and rejects invalid or assisted work before awarding mastery.' } : {}),
    };
  });
  const groups = ['existing-material-deterministic-candidate','additional-assessment-authoring','explanation-or-authorised-human-judgement'].map(category => {
    const rows = results.filter(row => row.completionDependency?.category === category);
    return { category, planned: rows.length, newlyValidated: rows.filter(row => row.status === 'verified-local-review').length, pending: rows.filter(row => row.status !== 'verified-local-review').length };
  });
  const summary = { activities: results.length, preserved: results.filter(row => row.originalValidatedPath).length, newlyValidated: results.filter(row => !row.originalValidatedPath && row.status === 'verified-local-review').length, localReviewTotal: results.filter(row => row.status === 'verified-local-review').length, pending: results.filter(row => row.status !== 'verified-local-review').length, conditionalSemanticScopes: results.filter(row => conditional.has(row.id)).map(row => row.id), groups, remaining: results.filter(row => row.status !== 'verified-local-review').map(row => ({ id: row.id, objective: row.objective, criterion: row.unresolvedCriterion, requiredIndependentTasks: row.requiredIndependentTasks })), evidenceDirectory, runtimeHash: run.sourceFingerprint, executorHash };
  assert.equal(summary.activities, 440); assert.equal(summary.preserved, 49); assert.equal(summary.newlyValidated, verified.length / 2); assert.equal(summary.localReviewTotal + summary.pending, 440);
  assert.equal(summary.newlyValidated, authoredActivities.filter(hasExtendedReview).length);
  writeFileSync('artifacts/coding-correction/reviews/coverage.json', JSON.stringify(results, null, 2) + '\n');
  writeFileSync('artifacts/coding-review-pass/coverage-summary.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
