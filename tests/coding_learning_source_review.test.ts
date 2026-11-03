import test from "node:test";
import assert from "node:assert/strict";
import { executeScenario } from "../src/lib/coding/learning/scenario-engine";
import { calculatorDesignReviewActivities } from "../src/lib/coding/learning/content/calculator-design-review";
import { checkExecution } from "../src/lib/coding/learning/checks";

test("source review uses supplied evidence and permissions rather than learner assertions", () => {
  const activity = calculatorDesignReviewActivities[0]!, fixture = activity.cases[0]!;
  if (activity.reference.type !== "visual") throw new Error("Expected practice document");
  const document = structuredClone(activity.reference.document) as Record<string, never>;
  const original = JSON.stringify(fixture.input);
  const good = executeScenario(document, fixture.input);
  assert.equal(good.ok, true); assert.equal(checkExecution(good, fixture.assertions).every((check) => check.passed), true);
  for (const sourceChoice of ["popular-claim", "restricted-copy", "unknown"]) {
    const run = executeScenario({ ...document, sourceChoice }, fixture.input);
    assert.equal(run.ok, true);
    assert.equal((run.output as { sourceReview: { suitable: boolean } }).sourceReview.suitable, false);
  }
  const forged = executeScenario({ ...document, sources: [{ id: "popular-claim", supported: true, permitted: true }] }, fixture.input);
  assert.equal(forged.ok, false, "The editable document cannot supply its own authoritative source records");
  const noCredit = executeScenario({ ...document, actions: [] }, fixture.input);
  assert.equal((noCredit.output as { sourceReview: { credited: boolean } }).sourceReview.credited, false);
  assert.equal(JSON.stringify(fixture.input), original);
  assert.equal((good.output as { realReportSent: boolean }).realReportSent, false);
});
