import test from "node:test";
import assert from "node:assert/strict";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { initialActivityState, transitionActivity } from "../src/lib/coding/learning/state-machine";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { visualReview, checkVisualReview, hasVisualReview } from "../src/lib/coding/learning/visual-review";
import { publicActivityView } from "../src/lib/coding/learning/public-view";
import type { CodingStage } from "../src/lib/coding/types";

const activity = firstRouteActivities[0]!;
test("picture review is bound to the actual program and observed movement, without exposing answers", async () => {
  const artifact = activity.independent[0]!.reference;
  const run = await executePractical(activity.workbench, artifact, activity.independent[0]!.cases[0]!.input);
  const challenge = visualReview(activity, artifact, run)!;
  assert(challenge); assert.equal(challenge.public.questions.length, 3);
  assert.equal("correct" in challenge.public, false);
  const submit = (binding: string, answers: Record<string, string>) => JSON.stringify({ type: "visual-review-v1", binding, answers });
  assert.equal(checkVisualReview(activity, artifact, run, submit(challenge.public.binding, challenge.correct)).passed, true);
  assert.equal(checkVisualReview(activity, artifact, run, submit("stale", challenge.correct)).passed, false);
  assert.equal(checkVisualReview(activity, artifact, run, submit(challenge.public.binding, {})).passed, false);
  const wrong = { ...challenge.correct, command: String((Number(challenge.correct.command) + 1) % 3) };
  assert.equal(checkVisualReview(activity, artifact, run, submit(challenge.public.binding, wrong)).passed, false);
  assert.equal(checkVisualReview(activity, artifact, run, "move right").passed, false);
  const changed = structuredClone(artifact); if (changed.type === "visual") changed.document = { handlers: { start: [] } };
  assert.equal(checkVisualReview(activity, changed, run, submit(challenge.public.binding, challenge.correct)).passed, false);
  assert.equal(hasVisualReview({ ...firstRouteActivities[1]!, inventoryId: "Y1.07" }), false, "A route rubric must not silently replace other lesson assessments");
  assert.equal(visualReview(activity, artifact, { ...run, ok: false }), null);
});
test("all six introductory route lessons and each independent variation use their own no-typing review", async () => {
  for (const lesson of firstRouteActivities) for (let variant = 0; variant < lesson.independent.length; variant++) {
    const state = initialActivityState(lesson, variant); state.stage = "review";
    state.completed = ["discover", "predict", "build", "practise", "debug", "create"];
    state.artifacts.create = lesson.independent[variant]!.reference;
    const run = await executePractical(lesson.workbench, state.artifacts.create, lesson.independent[variant]!.cases[0]!.input);
    const challenge = visualReview(lesson, state.artifacts.create, run);
    assert(challenge, `${lesson.inventoryId} variant ${variant} needs a review`);
    assert.equal(challenge.public.questions.length, 3);
    for (const question of challenge.public.questions) assert.equal(new Set(question.choices.map(choice => choice.text)).size, question.choices.length, "Answer choices must be distinct");
    if (lesson.inventoryId === "Y1.02") assert(challenge.public.questions.some(question => question.id === "route-order"));
    const submission = JSON.stringify({ type: "visual-review-v1", binding: challenge.public.binding, answers: challenge.correct });
    const result = await transitionActivity(lesson, state, { action: "reflect", stage: "review", revision: "fictional", explanation: submission }, { run: executePractical, teach: async () => ({ message: "Unused", source: "fallback", revealing: false }), reflect: async (...args) => checkVisualReview(...args) });
    assert.equal(result.state.mastered, true, `${lesson.inventoryId} variant ${variant} must pass native assessment and review`);
  }
});
test("successful visual review awards mastery only after the server reruns the independent practical cases", async () => {
  const state = initialActivityState(activity); state.stage = "review";
  state.completed = ["discover", "predict", "build", "practise", "debug", "create"] as CodingStage[];
  state.artifacts.create = activity.independent[0]!.reference;
  assert.equal(publicActivityView(activity, state).visualReviewSupported, true);
  assert.equal(publicActivityView(activity, state).visualReview, null, "A missing replay must not opt a supported lesson back into written assessment");
  const run = await executePractical(activity.workbench, state.artifacts.create, activity.independent[0]!.cases[0]!.input);
  const challenge = visualReview(activity, state.artifacts.create, run)!;
  const submission = JSON.stringify({ type: "visual-review-v1", binding: challenge.public.binding, answers: challenge.correct });
  let reviews = 0;
  const deps = { run: executePractical, teach: async () => ({ message: "Unused", source: "fallback" as const, revealing: false }), reflect: async (...args: Parameters<typeof checkVisualReview>) => { reviews++; return checkVisualReview(...args); } };
  const result = await transitionActivity(activity, state, { action: "reflect", stage: "review", revision: "fictional", explanation: submission }, deps);
  assert.equal(result.state.mastered, true); assert.equal(result.newlyMastered, true); assert.equal(result.state.completed.length, 7);
  assert.equal(result.state.explanationReview?.source, "evidence"); assert.equal(reviews, 1);
  const view = publicActivityView(activity, result.state);
  assert(view.visualReview); assert.equal("correct" in view.visualReview, false);
  const failed = structuredClone(state); failed.artifacts.create = { type: "visual", document: { variables: {}, handlers: { start: [] } } };
  reviews = 0;
  const rejected = await transitionActivity(activity, failed, { action: "reflect", stage: "review", revision: "fictional", explanation: submission }, deps);
  assert.equal(rejected.state.mastered, false); assert.equal(reviews, 0, "Correct quiz choices cannot bypass failing independent work");
});
