import { learnerSavedEvidence } from "./saved-evidence";
import { evidenceManifestSchema, evidenceSelectionSchema, type EvidenceManifest } from "./evidence-links";
import { LearningError } from "./state-machine";

/** Every selection is read through the learner's child scope. Submitted titles,
 * hashes, alleged roles and project content are never an authority source. */
export async function resolveOwnedEvidence(childId: string, selection: unknown, currentActivityId: string, required: 1 | 2): Promise<EvidenceManifest> {
  const selected = evidenceSelectionSchema.parse(selection);
  if (selected.length !== required) throw new LearningError(`Choose ${required} distinct saved creations for this task.`);
  const entries = await Promise.all(selected.map(async (item) => {
    const project = (await learnerSavedEvidence(childId, item.versionId))[0];
    if (!project?.artifactHash || !project.practicalCandidate || project.status !== "practical-verified" || project.activity.id === currentActivityId) throw new LearningError("Choose a saved creation with practical checks from another activity in your own account.", 404);
    return { slot: item.slot, versionId: project.versionId, activityId: project.activity.id, title: `Year ${project.activity.year} · ${project.activity.title}`, artifactHash: project.artifactHash };
  }));
  const manifest = evidenceManifestSchema.safeParse(entries);
  if (!manifest.success || !entries.some((entry) => entry.slot === "first") || required === 2 && !entries.some((entry) => entry.slot === "second")) throw new LearningError("Choose distinct creations and fill each required evidence slot.");
  return manifest.data;
}
