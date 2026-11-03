import { randomUUID } from "node:crypto";
import { activityContentHash, activityDefinition } from "./catalogue";
import { initialActivityState, transitionActivity, stageArtifact, artifactHash, LearningError, snapshotProjectFiles } from "./state-machine";
import { restoredPersonalInput } from "./personal-input";
import { initialiseStageFiles, setStageProjectFiles } from "./stage-files";
import { executePractical } from "./runtime";
import { teachActivity, reviewExplanation } from "./teacher";
import { publicActivityView } from "./public-view";
import type { ActivityAction, ActivityState, PracticalArtifact } from "./types";

type Version = { id: string; stage: string; label: string; createdAt: string; artifact: PracticalArtifact; files: Record<string, string>; personalInput?: unknown };
type Preview = { owner: string; activityId: string; contentHash: string; state: ActivityState; revision: number; expires: number; versions: Version[] };
const authorGlobal = globalThis as unknown as { codingAuthorPreviews?: Map<string, Preview> };
const previews = authorGlobal.codingAuthorPreviews ??= new Map<string, Preview>();
const ttl = 2 * 60 * 60 * 1000;
function view(id: string, preview: Preview) {
  const activity = activityDefinition(preview.activityId)!;
  return { ...publicActivityView(activity, preview.state, "author"), revision: `${id}:${preview.revision}`,
    versions: preview.versions.map(({ id, stage, label, createdAt }) => ({ id, stage, label, createdAt })) };
}
export function startAuthorPreview(owner: string, activityId: string) {
  for (const [id, preview] of previews) if (preview.expires < Date.now()) previews.delete(id);
  if (previews.size >= 32) throw new LearningError("The author preview limit is reached. Existing learner work is unaffected.", 503);
  const activity = activityDefinition(activityId);
  if (!activity) throw new LearningError("No authored activity matches this identifier.", 404);
  const id = randomUUID(), preview: Preview = { owner, activityId: activity.id, contentHash: activityContentHash(activity), state: initialActivityState(activity), revision: 0, expires: Date.now() + ttl, versions: [] };
  previews.set(id, preview);
  return view(id, preview);
}
export async function actOnAuthorPreview(owner: string, activityId: string, action: ActivityAction) {
  const [id, count] = action.revision.split(":"), preview = previews.get(id!);
  if (!preview || preview.owner !== owner || preview.expires < Date.now()) throw new LearningError("This temporary author preview has expired. Reopen it to continue; learner records were not changed.", 409);
  const activity = activityDefinition(activityId);
  if (!activity || activity.id !== preview.activityId || activityContentHash(activity) !== preview.contentHash || `${id}:${preview.revision}` !== action.revision || Number(count) !== preview.revision) throw new LearningError("The author preview changed. Reopen its current version before continuing.", 409);
  if (action.action === "support") throw new LearningError("An author preview cannot request a teacher for a child.", 403);
  const state = structuredClone(preview.state);
  if (action.action === "version") {
    const version = preview.versions.find((version) => version.id === action.versionId);
    if (!version) throw new LearningError("That version does not belong to this author preview.", 404);
    initialiseStageFiles(state);
    action = { ...action, artifact: version.artifact }; setStageProjectFiles(state, action.stage, version.files);
    state.personalInputs ??= {};
    const restored = restoredPersonalInput(version.personalInput, artifactHash(version.artifact));
    if (restored) state.personalInputs[action.stage] = restored; else delete state.personalInputs[action.stage];
  }
  const result = await transitionActivity(activity, state, action, { run: executePractical,
    teach: (definition, saved, stage, artifact, question) => teachActivity(definition, saved, stage, artifact, question, "author"),
    reflect: (definition, artifact, run, explanation) => reviewExplanation(definition, artifact, run, explanation, "author") });
  if (`${id}:${preview.revision}` !== action.revision) throw new LearningError("Another author request saved first. Your editor is retained.", 409);
  const versions = [...preview.versions];
  if (result.versionLabel) versions.unshift({ id: randomUUID(), stage: action.stage, label: result.versionLabel, createdAt: new Date().toISOString(), artifact: structuredClone(stageArtifact(activity, result.state, action.stage)), files: structuredClone(snapshotProjectFiles(result.state, action.stage, stageArtifact(activity, result.state, action.stage), result.versionLabel === "verified-stage")), personalInput: structuredClone(result.state.personalInputs?.[action.stage]) });
  if (Buffer.byteLength(JSON.stringify({ state: result.state, versions })) > 4 * 1024 * 1024) throw new LearningError("This temporary preview has reached its storage limit. Reopen an author preview; learner projects have not been changed.", 413);
  preview.state = result.state; preview.versions = versions; preview.revision++; preview.expires = Date.now() + ttl;
  return { ...view(id!, preview), message: `${result.message} Author preview only; no learner progress, rewards or certificates were changed.` };
}
