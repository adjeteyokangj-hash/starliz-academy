import { createHash } from "node:crypto";
import { z } from "zod";
import { ACTIVITY_VERSION, executionSchema, jsonValue, practicalArtifactSchema } from "./types";
import { bridgeContextSchema, matchesBridgeWorkspace } from "./bridge-context";
import { demonstrationAttachmentSchema } from "./demonstration-contract";

const snapshotSchema = z.object({
  schema: z.literal(1), version: z.literal(ACTIVITY_VERSION), activityId: z.string().min(1).max(100), activityHash: z.string().regex(/^[a-f0-9]{64}$/),
  artifact: practicalArtifactSchema, artifactHash: z.string().regex(/^[a-f0-9]{64}$/), input: jsonValue.nullable(),
  files: z.record(z.string().max(100), z.string().max(8192)), explanation: z.string().max(4000),
  execution: executionSchema.nullable().optional(), checks: z.array(z.object({ description: z.string().max(1000), passed: z.boolean() })).max(200), independent: z.boolean(),
  placement: bridgeContextSchema.nullable().optional(),
  demonstration: demonstrationAttachmentSchema.nullable().optional(), independentFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
/** A saved draft is real evidence of work, but is never an achievement or an
 * independent-mastery award. Ownership is checked separately by the reader. */
export function savedEvidenceSnapshot(programJson: string, lessonId: string, label: string) {
  if (Buffer.byteLength(programJson) > 524288) return null;
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(programJson));
    if (!parsed.success) return null;
    const saved = parsed.data, hash = createHash("sha256").update(JSON.stringify(saved.artifact)).digest("hex");
    if (lessonId !== `curriculum:${ACTIVITY_VERSION}:${saved.activityId}` && !matchesBridgeWorkspace(lessonId, saved.activityId, saved.placement) || hash !== saved.artifactHash) return null;
    const sourceMatches = saved.artifact.type !== "source" || saved.execution?.sourceHash === hash;
    const verified = Boolean(["verified-stage", "independent-mastery"].includes(label) && saved.execution?.ok && sourceMatches && saved.checks.length && saved.checks.every((check) => check.passed));
    // Old visual snapshots did not retain their input dimensions. Preserve their
    // source and checks, but do not invent a replay map or show mismatched output.
    const replayable = sourceMatches && (saved.artifact.type === "source" || saved.input !== null);
    const demonstration = saved.demonstration?.metadata.artifactHash === saved.artifactHash && saved.demonstration.metadata.taskHash === saved.independentFingerprint ? saved.demonstration : null;
    return { ...saved, demonstration, execution: replayable ? saved.execution ?? null : null, status: verified ? "practical-verified" as const : "saved-draft" as const };
  } catch { return null; }
}
