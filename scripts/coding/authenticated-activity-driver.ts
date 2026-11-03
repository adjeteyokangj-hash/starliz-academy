import assert from "node:assert/strict";
import type { APIRequestContext } from "@playwright/test";
import { bindEvidenceTemplate, type EvidenceManifest } from "../../src/lib/coding/learning/evidence-links";
import { jsonLeafEvidence, type publicActivityView } from "../../src/lib/coding/learning/public-view";
import { initialActivityState, variantFingerprint } from "../../src/lib/coding/learning/state-machine";
import type { ActivityAction, ActivityContent, PracticalArtifact } from "../../src/lib/coding/learning/types";

type Workspace = ReturnType<typeof publicActivityView> & { revision: string; versions: Array<{ id: string; stage: string; label: string }>; message?: string };
export type JourneyObservation = { activity: string; stages: string[]; restoredVersions: number; modelInstruction: boolean; modelReview: boolean; mastered: boolean; syntheticAuthorArtifacts: true };

/** Synthetic acceptance driver through real authenticated HTTP routes. It uses
 * author artifacts as test inputs, never inserts progress or forces a grade.
 * Required original media is deliberately refused rather than fabricated. */
export async function verifyAuthenticatedActivity(request: APIRequestContext, endpoint: string, activity: ActivityContent, options: { evidence?: { worked: EvidenceManifest; independent: EvidenceManifest }; expectProtectedReview?: boolean; expectUnavailableModelReview?: boolean; modelInstructionExpected?: boolean; stopAfterBuild?: boolean; explanation?: (workspace: Workspace) => string; onStep?: (step: { action: string; stage: string; resultingStage: string; completedStages: number; failedCriteria: string[]; mastered: boolean }) => void } = {}): Promise<JourneyObservation> {
  const loaded = await request.get(endpoint); assert.equal(loaded.status(), 200, `Open ${activity.inventoryId}`);
  let workspace: Workspace = (await loaded.json()).workspace;
  const observation: JourneyObservation = { activity: activity.inventoryId, stages: [], restoredVersions: 0, modelInstruction: false, modelReview: false, mastered: false, syntheticAuthorArtifacts: true };
  async function action(value: Omit<ActivityAction, "revision">) {
    for (let retry = 0; retry < 3; retry++) {
      const response = await request.post(endpoint, { data: { ...value, revision: workspace.revision }, timeout: 180000 });
      if (response.status() === 429 && retry < 2) { const seconds = Number(response.headers()["retry-after"]); assert.ok(Number.isFinite(seconds) && seconds > 0 && seconds <= 60); await new Promise(resolve => setTimeout(resolve, seconds * 1000)); continue; }
      const body = await response.json(); assert.equal(response.status(), 200, `${activity.inventoryId} ${value.stage}/${value.action}: ${body.error ?? "request refused"}`); assert.ok(body.workspace?.revision); workspace = body.workspace;
      options.onStep?.({ action: value.action, stage: value.stage, resultingStage: workspace.stage, completedStages: workspace.completedStages.length, failedCriteria: workspace.checks.filter(check => !check.passed).map(check => check.description), mastered: workspace.mastered }); return;
    }
    throw new Error("The genuine activity rate limit has not cleared.");
  }
  async function bind(stage: ActivityAction["stage"], independent = false) {
    if (!activity.evidenceSlots) return;
    const manifest = independent ? options.evidence?.independent : options.evidence?.worked;
    assert.ok(manifest && manifest.length === activity.evidenceSlots, "Resolve distinct real owned creations before an evidence activity.");
    await action({ action: "open", stage, evidenceBindings: manifest.map(({ slot, versionId }) => ({ slot, versionId })) });
  }
  function selectedVariant() {
    return activity.independent.find((_variant, index) => variantFingerprint(activity, initialActivityState(activity, index)) === workspace.independentFingerprint);
  }
  function artifactFor(artifact: PracticalArtifact, stage: "build" | "practise" | "debug" | "create") {
    const manifest = stage === "create" ? options.evidence?.independent : options.evidence?.worked;
    const fixture = stage === "create" ? selectedVariant()?.cases[0] : stage === "debug" ? activity.debugCases[0] : stage === "practise" ? activity.practiceCases[0] : activity.cases[0];
    return manifest && fixture ? bindEvidenceTemplate(artifact, fixture.input, manifest) : artifact;
  }
  async function prepare(stage: "build" | "practise" | "debug" | "create", artifact: PracticalArtifact) {
    if (activity.workflow?.planBeforeRun && ["build", "create"].includes(stage)) {
      assert.equal(artifact.type, "visual"); if (artifact.type !== "visual" || !artifact.document || typeof artifact.document !== "object" || Array.isArray(artifact.document)) throw new Error("Use a real visual route plan.");
      const document = structuredClone(artifact.document);
      document.handlers = Object.fromEntries(Object.keys(document.handlers as object).map(key => [key, []])); document.procedures = {};
      await action({ action: "plan", stage, artifact: { type: "visual", document } });
    }
    await action({ action: "save", stage, artifact });
    const saved = workspace.versions.find(version => version.stage === stage && version.label === "saved-work"); assert.ok(saved, "Saving must create an actual frozen version.");
    if (activity.workflow?.restoreVersion) { await action({ action: "version", stage, versionId: saved.id }); observation.restoredVersions++; }
    await action({ action: "run", stage, artifact }); assert.equal(workspace.lastExecution?.ok, true, workspace.lastExecution?.error);
  }
  assert.equal(workspace.stage, "discover", "This acceptance driver needs a fresh QA workspace, not a reset existing record.");
  await bind("discover"); await action({ action: "teach", stage: "discover" });
  observation.modelInstruction = workspace.tutorMessages.some(turn => turn.stage === "discover" && turn.purpose === "instruction" && turn.source === "model");
  assert.equal(observation.modelInstruction, options.modelInstructionExpected ?? true, "Report model and fallback instruction distinctly.");
  await action({ action: "check", stage: "discover" }); assert.equal(workspace.stage, "predict"); observation.stages.push("discover");
  await action({ action: "predict", stage: "predict", choiceId: activity.prediction.correctId }); assert.equal(workspace.stage, "build"); observation.stages.push("predict");
  for (const stage of ["build", "practise", "debug"] as const) {
    assert.equal(workspace.stage, stage); await bind(stage);
    if (stage === "debug") { await action({ action: "run", stage, artifact: artifactFor(activity.faulty, stage) }); }
    const artifact = artifactFor(stage === "debug" ? activity.debugReference : activity.reference, stage);
    await prepare(stage, artifact); await action({ action: "check", stage, artifact });
    assert.equal(workspace.completedStages.includes(stage), true, `Actual ${stage} checks must pass.`); observation.stages.push(stage);
    if (stage === "build" && options.stopAfterBuild) return observation;
  }
  assert.equal(workspace.stage, "create"); await bind("create", true);
  const variant = selectedVariant(); assert.ok(variant, "Use the server-selected independent task fingerprint; prompt wording alone is not unique.");
  const artifact = artifactFor(variant.reference, "create"); await prepare("create", artifact);
  if (activity.workflow?.originalDemonstration) throw new Error("This journey needs its own actual original demonstration; this driver cannot manufacture media evidence.");
  await action({ action: "check", stage: "create", artifact }); assert.equal(workspace.stage, "review"); observation.stages.push("create");
  const leaves = jsonLeafEvidence(workspace.lastExecution?.output ?? null).slice(0, 8).map(leaf => `${leaf.path} is ${leaf.value}`).join("; ");
  const output = workspace.lastExecution?.output;
  const routeExplanation = activity.workbench === "route" && output && typeof output === "object" && !Array.isArray(output) && typeof output.x === "number" && typeof output.y === "number"
    ? `I used ${activity.concepts.join(" and ")} to follow the commands in order. Each movement arrow changes the position by one square, so changing the order can change the trail. The actual output reports x=${output.x} and y=${output.y}; the displayed destination is column ${output.x + 1}, row ${output.y + 1}. I checked the ordered trail as well as the final square against the task.` : null;
  const explanation = options.explanation?.(workspace) ?? routeExplanation ?? `I used ${activity.concepts.join(" and ")} in this project. ${activity.instruction.exampleReasoning[0] ?? ""} The actual observed output shows ${leaves}. I checked this output against the task after repairing the seeded fault, rather than treating a saved draft as a successful test.`;
  await action({ action: "reflect", stage: "review", explanation: explanation.slice(0, 4000) });
  if (options.expectProtectedReview || options.expectUnavailableModelReview) { assert.equal(workspace.mastered, false); assert.equal(workspace.explanationReview?.passed, false); if (options.expectProtectedReview) assert.equal(workspace.explanationReview?.pending, true); assert.equal(workspace.explanationReview?.source, "evidence"); }
  else { assert.equal(workspace.explanationReview?.source, "model"); assert.equal(workspace.explanationReview?.passed, true, workspace.explanationReview?.message); assert.equal(workspace.mastered, true); observation.stages.push("review"); observation.modelReview = true; observation.mastered = true; }
  return observation;
}
