import test, { after } from "node:test";
import assert from "node:assert/strict";
import { authoredActivities } from "../src/lib/coding/learning/catalogue";
import { extendedReviewMaterial } from "../src/lib/coding/learning/review-material";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { visualReview, checkVisualReview } from "../src/lib/coding/learning/visual-review";
import { checkExecution, sameJson } from "../src/lib/coding/learning/checks";
import { executeSource } from "../src/lib/coding/learning/source-execution";
import { streamIsolatedExecutor } from "../scripts/coding/stream-isolated-executor";
import { hasExtendedReview, remainingReviewCriterion } from "../src/lib/coding/learning/extended-review";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { activityContentHash } from "../src/lib/coding/learning/catalogue";
import { initialActivityState, transitionActivity, variantFingerprint } from "../src/lib/coding/learning/state-machine";
import { practicalExecutionHash, curriculumRuntimeHash } from "../scripts/coding/verify-curriculum-runtime";

const directory = `artifacts/coding-review-pass/validation-${randomUUID()}`;
mkdirSync(directory, { recursive: true });
const executionHash = practicalExecutionHash();
const sourceFingerprint = curriculumRuntimeHash();
const materialHash = createHash("sha256").update(readFileSync("src/lib/coding/learning/review-material.ts")).digest("hex");
const reuseDirectory = process.env.CODING_REVIEW_EXECUTION_REUSE_DIR;
const reuseRows: Array<{ id: string; contentHash: string; executorHash: string; artifact: Parameters<typeof executePractical>[1]; input: Parameters<typeof executePractical>[2]; run: Awaited<ReturnType<typeof executePractical>> }> = reuseDirectory ? readFileSync(`${reuseDirectory}/executions.jsonl`, "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line)) : [];
const currentActivities = new Map(authoredActivities.map(activity => [activity.inventoryId, { activity, contentHash: activityContentHash(activity) }]));
writeFileSync(`${directory}/run.json`, JSON.stringify({ directory, sourceFingerprint, materialHash, isolatedExecutionRequested: process.env.CODING_RUNNER_CONTAINER_TESTS === "1", reusedExecutionDirectory: reuseDirectory ?? null, reuseRule: "Only successful executions with matching current content/executor hashes and identical workbench, full artifact and input. Every Review assertion is rerun." }, null, 2));

let executor: ReturnType<typeof streamIsolatedExecutor> | undefined;
after(async () => { await executor?.close(); });
const execute = async (...args: Parameters<typeof executePractical>) => {
  const hash = await executionHash;
  const cached = reuseRows.find(row => {
    const current = currentActivities.get(row.id);
    return row.run.ok && current?.activity.workbench === args[0] && row.contentHash === current.contentHash && row.executorHash === hash && sameJson(row.artifact as unknown as import('../src/lib/coding/learning/types').Json, args[1] as unknown as import('../src/lib/coding/learning/types').Json) && sameJson(row.input, args[2]);
  });
  if (cached) { appendFileSync(`${directory}/reused-executions.jsonl`, JSON.stringify({ id: cached.id, from: reuseDirectory, contentHash: cached.contentHash, executorHash: hash }) + "\n"); return structuredClone(cached.run); }
  return executePractical(args[0], args[1], args[2], (source, input) => executeSource(source, input, executor ??= streamIsolatedExecutor(`${directory}/jobs.jsonl`)));
};

for (const activity of authoredActivities.filter(activity => extendedReviewMaterial[activity.inventoryId])) test(`${activity.inventoryId}: ${hasExtendedReview(activity) ? "Review distinguishes reasoning, evidence, activity, owner and saved artifact" : "unassessed required criterion preserves pending Review"}`, { skip: hasExtendedReview(activity) && (activity.independent.some(variant => variant.reference.type === "source") || ["engineering", "dual"].includes(activity.workbench)) && process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" }, async () => {
  if (!hasExtendedReview(activity)) { assert(remainingReviewCriterion(activity)); return; }
  for (const variant of activity.independent) {
    const artifact = variant.reference;
    const run = await execute(activity.workbench, artifact, variant.cases[0]!.input);
    appendFileSync(`${directory}/executions.jsonl`, JSON.stringify({ id: activity.inventoryId, contentHash: activityContentHash(activity), executorHash: await executionHash, variant: variant.id, artifact, input: variant.cases[0]!.input, run }) + "\n");
    assert(checkExecution(run, variant.cases[0]!.assertions).every(check => check.passed));
    const scope = { ownershipKey: "learner-a", independentVariant: activity.independent.indexOf(variant) };
    const review = visualReview(activity, artifact, run, scope); assert(review, `${activity.inventoryId}: complete evidence required`);
    const submission = (answers = review.correct) => JSON.stringify({ type: "visual-review-v1", binding: review.public.binding, answers });
    assert(checkVisualReview(activity, artifact, run, submission(), scope).passed);
    // A fresh assessment execution may have different wall-clock diagnostics.
    const replay = structuredClone(run);
    if (replay.output && typeof replay.output === 'object' && !Array.isArray(replay.output)) {
      const result = replay.output.result;
      if (result && typeof result === 'object' && !Array.isArray(result) && typeof result.elapsed_ms === 'number') {
        result.elapsed_ms = Math.max(0.1, result.elapsed_ms / 2);
        assert(checkVisualReview(activity, artifact, replay, submission(), scope).passed, 'A still-valid runtime diagnostic must not invalidate the saved Review');
      }
    }
    for (const question of review.public.questions) {
      const wrong = question.choices.find(choice => !(review.accepted?.[question.id] ?? [review.correct[question.id]]).includes(choice.id))!.id;
      assert(!checkVisualReview(activity, artifact, run, submission({ ...review.correct, [question.id]: wrong }), scope).passed, question.prompt);
    }
    for (const [question, accepted] of Object.entries(review.accepted ?? {})) for (const answer of accepted) assert(checkVisualReview(activity, artifact, run, submission({ ...review.correct, [question]: answer }), scope).passed);
    assert(!checkVisualReview(activity, artifact, run, submission({}), scope).passed);
    assert(!checkVisualReview(activity, artifact, run, "it works", scope).passed);
    assert(!checkVisualReview(activity, artifact, run, submission(), "learner-b:" + variant.id).passed);
    assert(!checkVisualReview(activity, artifact, run, submission(), { ...scope, ownershipKey: "learner-b" }).passed);
    assert(!checkVisualReview(activity, artifact, run, submission(), { ...scope, independentVariant: (scope.independentVariant + 1) % activity.independent.length }).passed);
    assert(!checkVisualReview(activity, artifact, { ...run, ok: false }, submission(), scope).passed);
    assert(!checkVisualReview(activity, artifact, { ...run, output: {} }, submission(), scope).passed);
    const changed = structuredClone(artifact);
    if (changed.type === "visual") changed.document = { savedDifferentVersion: true, original: changed.document };
    else changed.source += "\n# changed saved version";
    assert(!checkVisualReview(activity, changed, run, submission(), scope).passed);
    const different = authoredActivities.find(other => other.id !== activity.id && extendedReviewMaterial[other.inventoryId])!;
    assert(!checkVisualReview(different, artifact, run, submission(), scope).passed);
    appendFileSync(`${directory}/validated.jsonl`, JSON.stringify({ id: activity.inventoryId, variant: variant.id, materialHash, criteria: extendedReviewMaterial[activity.inventoryId], questions: review.public.questions.length, acceptedAlternatives: Object.values(review.accepted ?? {}).filter(answers => answers.length > 1).length }) + "\n");
  }
});

test("source mastery reruns evidence, preserves timing replay and rejects invalid or assisted work", { skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" }, async () => {
  const activity = authoredActivities.find(activity => activity.inventoryId === "Y5.07")!;
  const artifact = { ...activity.independent[0]!.reference, source: 'result = "Above"\nprint(result)' };
  assert.equal(artifact.type, "source");
  const run = await execute(activity.workbench, artifact, activity.independent[0]!.cases[0]!.input);
  const review = visualReview(activity, artifact, run)!; assert(review);
  const state = initialActivityState(activity); state.stage = "review"; state.completed = ["discover", "predict", "build", "practise", "debug", "create"]; state.artifacts.create = artifact;
  const action = { stage: "review" as const, action: "reflect" as const, revision: "fixture", explanation: JSON.stringify({ type: "visual-review-v1", binding: review.public.binding, answers: review.correct }) };
  const deps = { run: execute, teach: async () => ({ message: "unused", source: "fallback" as const, revealing: false }), reflect: async (...args: Parameters<typeof checkVisualReview>) => checkVisualReview(...args) };
  const result = await transitionActivity(activity, state, action, deps);
  assert.equal(result.newlyMastered, false); assert(!result.state.completed.includes("review")); assert.deepEqual(result.state.artifacts.create, artifact);
  const assisted = structuredClone(state); assisted.assistedVariantIds = [variantFingerprint(activity, assisted)];
  await assert.rejects(transitionActivity(activity, assisted, action, deps), /received an answer/);
  assert.deepEqual(assisted.assistedVariantIds, [variantFingerprint(activity, assisted)]);

  const retryActivity = authoredActivities.find(activity => activity.inventoryId === 'Y11.02')!;
  const reference = retryActivity.independent[0]!.reference;
  const firstRun = await execute(retryActivity.workbench, reference, retryActivity.independent[0]!.cases[0]!.input);
  const ownership = { ownershipKey: 'source-replay-learner', independentVariant: 0 };
  const retryReview = visualReview(retryActivity, reference, firstRun, ownership)!; assert(retryReview);
  const independent = initialActivityState(retryActivity); independent.stage = 'review'; independent.completed = ['discover','predict','build','practise','debug','create']; independent.artifacts.create = reference;
  let freshRuns = 0;
  const outcome = await transitionActivity(retryActivity, independent, { action: 'reflect', stage: 'review', revision: "source-replay-review", explanation: JSON.stringify({ type: 'visual-review-v1', binding: retryReview.public.binding, answers: retryReview.correct }) }, {
    run: async (workbench, artifact, input) => { freshRuns++; return executePractical(workbench, artifact, input, (source, data) => executeSource(source, data, executor ??= streamIsolatedExecutor(`${directory}/jobs.jsonl`))); },
    teach: deps.teach, reflect: async (...args) => checkVisualReview(...args, ownership),
  });
  assert(outcome.newlyMastered, outcome.message); assert(outcome.state.mastered); assert.equal(freshRuns, retryActivity.independent[0]!.cases.length);
  writeFileSync(`${directory}/source-replay-mastery.json`, JSON.stringify({ id: retryActivity.inventoryId, freshIsolatedAssessmentRuns: freshRuns, passed: true, previousObservedElapsed: (firstRun.output as { result?: { elapsed_ms?: number } }).result?.elapsed_ms, reassessedElapsed: (outcome.state.lastExecution!.output as { result?: { elapsed_ms?: number } }).result?.elapsed_ms }, null, 2));
});

test("different valid route, SQL, poster and feasible plan implementations retain their Review path", { skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" }, async () => {
  for (const id of ["Y2.02", "Y9.08", "Y4.17", "Y10.19", "Y11.13"]) {
    const activity = authoredActivities.find(activity => activity.inventoryId === id)!;
    const variant = activity.independent[0]!, artifact = structuredClone(variant.reference);
    if (id === "Y2.02" && artifact.type === "visual") {
      const document = artifact.document as { handlers: { start: Array<{ op: string; amount?: number }> } };
      document.handlers.start = document.handlers.start.flatMap(command => command.op === "forward" && command.amount === 2 ? [{ op: "forward", amount: 1 }, { op: "forward", amount: 1 }] : [command]);
    } else if (id === "Y9.08" && artifact.type === "source") artifact.source = artifact.source.replace("category='practice' AND amount>=3", "amount>=3 AND category='practice'");
    else if (id === "Y4.17" && artifact.type === "visual") {
      const document = artifact.document as { picture: { actions: Array<{ op: string; patch?: { shapes?: Array<{ x: number; y: number }> } }> } };
      for (const action of document.picture.actions) for (const shape of action.patch?.shapes ?? []) { shape.x += 10; shape.y += 10; }
    } else if (["Y10.19", "Y11.13"].includes(id) && artifact.type === "visual") {
      const document = artifact.document as { tasks: Array<{ id: string; effort: number }> };
      document.tasks.reverse();
      const from = document.tasks.find(task => task.id === (id === "Y10.19" ? "interface" : "integrate"))!;
      const to = document.tasks.find(task => task.id === (id === "Y10.19" ? "api" : "prototype"))!;
      from.effort--; to.effort++;
    }
    assert.notDeepEqual(artifact, variant.reference);
    for (const sample of variant.cases) { const execution = await execute(activity.workbench, artifact, sample.input); assert(checkExecution(execution, sample.assertions).every(check => check.passed), `${id}/${sample.id}`); }
    const execution = await execute(activity.workbench, artifact, variant.cases[0]!.input);
    const review = visualReview(activity, artifact, execution)!; assert(review);
    assert(checkVisualReview(activity, artifact, execution, JSON.stringify({ type: "visual-review-v1", binding: review.public.binding, answers: review.correct })).passed);
  }
});

test("a fresh quiz cannot certify contradictory free-form planning or disrespectful saved feedback", { skip: process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" }, async () => {
  for (const id of ["Y11.13", "Y6.22"]) {
    const activity = authoredActivities.find(activity => activity.inventoryId === id)!, variant = activity.independent[0]!;
    const artifact = structuredClone(variant.reference); assert(artifact.type === "visual");
    const document = artifact.document as { tasks: Array<{ need: string }>; notes: string };
    if (id === "Y11.13") document.tasks[0]!.need = "An unrelated task that does not address this user's problem.";
    else document.notes += " The contributor is stupid and should be blamed personally.";
    const execution = await execute(activity.workbench, artifact, variant.cases[0]!.input);
    assert(checkExecution(execution, variant.cases[0]!.assertions).every(check => check.passed), "The practical length/substring checks alone are insufficient here");
    assert.equal(visualReview(activity, artifact, execution), null);
  }
});

const original = new Set((JSON.parse(readFileSync("artifacts/coding-review-pass/coverage-before.json", "utf8")) as Array<{ id: string; status: string }>).filter(row => row.status === "verified-local-review").map(row => row.id));
for (const activity of authoredActivities.filter(activity => original.has(activity.inventoryId))) test(`Preserved original Review ${activity.inventoryId}`, { skip: activity.independent.some(variant => variant.reference.type === "source") && process.env.CODING_RUNNER_CONTAINER_TESTS !== "1" }, async () => {
  for (const variant of activity.independent) {
    const execution = await execute(activity.workbench, variant.reference, variant.cases[0]!.input);
    const review = visualReview(activity, variant.reference, execution)!; assert(review);
    const submit = (answers: Record<string, string>) => JSON.stringify({ type: "visual-review-v1", binding: review.public.binding, answers });
    assert(checkVisualReview(activity, variant.reference, execution, submit(review.correct)).passed);
    const question = review.public.questions[0]!;
    assert(!checkVisualReview(activity, variant.reference, execution, submit({ ...review.correct, [question.id]: question.choices.find(choice => choice.id !== review.correct[question.id])!.id })).passed);
    appendFileSync(`${directory}/original-validated.jsonl`, JSON.stringify({ id: activity.inventoryId, variant: variant.id }) + "\n");
  }
});
