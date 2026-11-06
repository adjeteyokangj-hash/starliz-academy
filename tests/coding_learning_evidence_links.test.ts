import test from "node:test";
import assert from "node:assert/strict";
import { evidenceManifestSchema, resolveEvidenceLinks, independentEvidenceIsFresh } from "../src/lib/coding/learning/evidence-links";
import { activityActionSchema } from "../src/lib/coding/learning/types";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { initialActivityState, transitionActivity, variantFingerprint } from "../src/lib/coding/learning/state-machine";
import { stageArtifact } from "../src/lib/coding/learning/state-machine";
import { privateWebEvidenceActivities } from "../src/lib/coding/learning/content/private-web-evidence";

test("evidence links resolve only to their distinct trusted frozen creation slots", () => {
  const manifest = evidenceManifestSchema.parse([{ slot: "first", versionId: "owned-version-a", activityId: "owned-activity-a", title: "Material calculator", artifactHash: "a".repeat(64) }, { slot: "second", versionId: "owned-version-b", activityId: "owned-activity-b", title: "Model game", artifactHash: "b".repeat(64) }]);
  const anchors = [{ id: "first-link", slot: "first", text: "View Material calculator", href: "#saved-first", targetExists: true, caption: "My Material calculator uses tested conversion functions." }, { id: "second-link", slot: "second", text: "View Model game", href: "#saved-second", targetExists: true, caption: "My Model game responds to its controls." }];
  assert.equal(resolveEvidenceLinks(anchors, manifest).allResolved, true);
  for (const href of ["#missing", "https://fictional.invalid/public", "/api/student/coding/evidence?versionId=foreign"]) {
    const resolved = resolveEvidenceLinks([{ ...anchors[0]!, href }, anchors[1]!], manifest);
    assert.equal(resolved.allResolved, false); assert.equal(resolved.resolvedCount, 1);
    assert.equal(resolved.links[0]!.versionId, "owned-version-a", "Untrusted markup cannot replace the bound frozen record");
  }
  assert.equal(resolveEvidenceLinks([anchors[0]!, anchors[0]!, anchors[1]!], manifest).allResolved, false, "Duplicate slot anchors are ambiguous");
  assert.equal(resolveEvidenceLinks([{ ...anchors[0]!, text: "Click here" }, anchors[1]!], manifest).allResolved, false);
  assert.equal(evidenceManifestSchema.safeParse([manifest[0], { ...manifest[1], versionId: manifest[0]!.versionId }]).success, false);
  assert.equal(independentEvidenceIsFresh(manifest, manifest), false);
  assert.equal(independentEvidenceIsFresh([{ ...manifest[0]!, versionId: "new-revision-of-same-creation" }], manifest), false);
  assert.equal(independentEvidenceIsFresh([{ ...manifest[0]!, activityId: "different-creation", versionId: "different-version" }], manifest), true);
});

test("owned evidence binds readonly and unsaved templates without rewriting saved learner code", async () => {
  const activity = privateWebEvidenceActivities[0]!, state = initialActivityState(activity);
  const binding = evidenceManifestSchema.parse([{ slot: "first", versionId: "unit-owned-version", activityId: "unit-owned-activity", title: 'Year 1 · Saved & <title> "test"', artifactHash: "c".repeat(64) }]);
  state.evidenceBindings = { discover: binding };
  const original = JSON.stringify(activity.example), displayed = stageArtifact(activity, state, "discover");
  if (displayed.type !== "source") throw new Error("Expected bound web template");
  assert.ok(displayed.html?.includes("Saved &amp; &lt;title&gt; &quot;test&quot;"));
  assert.equal(displayed.html?.includes("Saved & <title>"), false);
  assert.equal(JSON.stringify(activity.example), original);
  state.stage = "predict"; state.completed = ["discover"];
  const advanced = await transitionActivity(activity, state, { action: "predict", stage: "predict", revision: "unit", choiceId: activity.prediction.correctId }, {
    run: async () => { throw new Error("Recording a prediction must not execute"); }, teach: async () => ({ message: "Unused", source: "fallback", revealing: false }), reflect: async () => ({ passed: false, source: "evidence", message: "Unused", confidence: 0 }),
  });
  assert.equal(advanced.state.stage, "build");
  assert.deepEqual(advanced.state.evidenceBindings?.build, binding);
  assert.equal(advanced.state.evidenceBindings?.create, undefined);
  const scaffold = stageArtifact(activity, advanced.state, "build");
  assert.notDeepEqual(scaffold, activity.starter);
  advanced.state.artifacts.build = structuredClone(activity.reference);
  assert.deepEqual(stageArtifact(activity, advanced.state, "build"), activity.reference, "Rebinding cannot silently rewrite already saved learner source");
});

test("submitted bindings cannot supply authority or change independent help identity", async () => {
  const base = { action: "open", stage: "build", revision: "unit", evidenceBindings: [{ slot: "first", versionId: "owned-version" }] };
  assert.equal(activityActionSchema.safeParse(base).success, true);
  assert.equal(activityActionSchema.safeParse({ ...base, evidenceBindings: [{ ...base.evidenceBindings[0], title: "Forged title", artifactHash: "a".repeat(64), childId: "foreign" }] }).success, false);
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity);
  state.stage = "build"; state.completed = ["discover", "predict"];
  const fingerprint = variantFingerprint(activity, state);
  state.assistedVariantIds = [fingerprint];
  state.evidenceBindings = { create: [{ slot: "first", versionId: "a-different-private-version", activityId: "different-prior-work", title: "Different prior work", artifactHash: "b".repeat(64) }] };
  assert.equal(variantFingerprint(activity, state), fingerprint);
  let ran = false;
  await assert.rejects(() => transitionActivity(activity, state, activityActionSchema.parse(base), {
    run: async () => { ran = true; throw new Error("Unresolved binding must not execute"); },
    teach: async () => ({ message: "Unused", source: "fallback", revealing: false }),
    reflect: async () => ({ passed: false, source: "evidence", message: "Unused", confidence: 0 }),
  }), /authorised workspace service/);
  assert.equal(ran, false);
  assert.deepEqual(state.assistedVariantIds, [fingerprint]);
});
