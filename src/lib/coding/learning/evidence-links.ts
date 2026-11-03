import { z } from "zod";
import type { Json, PracticalArtifact } from "./types";

export const evidenceManifestSchema = z.array(z.object({
  slot: z.enum(["first", "second"]), versionId: z.string().min(1).max(100), activityId: z.string().min(1).max(100), title: z.string().min(1).max(200), artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()).min(1).max(2).refine((entries) => new Set(entries.map((entry) => entry.slot)).size === entries.length && new Set(entries.map((entry) => entry.versionId)).size === entries.length && new Set(entries.map((entry) => entry.activityId)).size === entries.length, "Use distinct saved creations and slots.");
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;
export const evidenceSelectionSchema = z.array(z.object({ slot: z.enum(["first", "second"]), versionId: z.string().min(1).max(100) }).strict()).min(1).max(2);
export function independentEvidenceIsFresh(current: EvidenceManifest, discovery: EvidenceManifest = []) { const used = new Set(discovery.map((entry) => entry.activityId)); return current.every((entry) => !used.has(entry.activityId)); }
export function bindEvidenceInput(input: Json, manifest?: EvidenceManifest): Json { return manifest && input && typeof input === "object" && !Array.isArray(input) ? { ...input, savedEvidence: manifest } : input; }
/** Substitution is only for unsaved curriculum templates. Saved learner source
 * must never be silently rewritten when a binding changes. */
export function bindEvidenceTemplate(artifact: PracticalArtifact, exampleInput: Json, owned: EvidenceManifest): PracticalArtifact {
  if (artifact.type !== "source" || artifact.entry !== "dom" || !artifact.html || !owned.length) return artifact;
  const input = exampleInput && typeof exampleInput === "object" && !Array.isArray(exampleInput) ? exampleInput : {};
  const examples = evidenceManifestSchema.safeParse(input.savedEvidence);
  if (!examples.success) return artifact;
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const substitutions = examples.data.flatMap((entry) => { const bound = owned.find((item) => item.slot === entry.slot); return bound ? [{ from: escape(entry.title), to: escape(bound.title), token: `\u0000starliz-evidence-${entry.slot}\u0000` }] : []; }).sort((a, b) => b.from.length - a.from.length);
  let html = artifact.html;
  for (const item of substitutions) html = html.replaceAll(item.from, item.token);
  for (const item of substitutions) html = html.replaceAll(item.token, item.to);
  return { ...artifact, html };
}
const anchorSchema = z.object({ id: z.string().max(80), slot: z.string().max(20), text: z.string().max(1000), href: z.string().max(1000), targetExists: z.boolean(), caption: z.string().max(1000) }).strict();

/** The caller must resolve this manifest from ownership-scoped frozen records.
 * Inspectors supply anchors from a fresh inert DOM, never learner-returned
 * grading metadata. This function grants no access and executes no source. */
export function resolveEvidenceLinks(anchors: Json, trustedManifest: EvidenceManifest) {
  const manifest = evidenceManifestSchema.parse(trustedManifest), parsed = z.array(anchorSchema).max(100).safeParse(anchors);
  const inspected = parsed.success ? parsed.data : [];
  const links = manifest.map((entry) => {
    const candidates = inspected.filter((anchor) => anchor.slot === entry.slot), anchor = candidates.length === 1 ? candidates[0] : undefined;
    const valid = Boolean(anchor && anchor.id && anchor.href === `#saved-${entry.slot}` && anchor.targetExists && anchor.text.toLowerCase().includes(entry.title.toLowerCase()) && anchor.caption.toLowerCase().includes(entry.title.toLowerCase()));
    return { ...entry, anchorId: anchor?.id ?? "", valid };
  });
  return { links, allResolved: links.every((link) => link.valid), resolvedCount: links.filter((link) => link.valid).length };
}
