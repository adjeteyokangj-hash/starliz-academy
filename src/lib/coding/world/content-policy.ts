import { z } from "zod";
import { missions, locationIds } from "./model";
import { safeTeachingMessage } from "../learning/tutor-safety";
export class ContentReviewError extends Error {}
const teachingText = (min: number, max: number) => z.string().trim().min(min).max(max).refine(safeTeachingMessage, "Use age-appropriate text without links or requests for personal information.");
export const worldContentMetadataSchema = z.object({
  chapter: z.object({ title: teachingText(3, 100), order: z.number().int().min(1).max(50) }).strict().optional(),
  curriculumLinks: z.array(z.object({ kind: z.enum(["lesson", "activity"]), id: z.string().min(1).max(100) }).strict()).max(12).default([]),
  extensions: z.array(z.object({ id: z.string().regex(/^extra-[a-z0-9-]{3,48}$/), title: teachingText(3, 100), objective: teachingText(15, 1200), simulation: z.enum(locationIds), prerequisites: z.array(z.string().refine(id => missions.some(mission => mission.id === id))).max(4) }).strict()).max(3).default([]),
  badgeTitle: teachingText(3, 80).optional(),
}).strict().superRefine((metadata, context) => { if (new Set(metadata.extensions.map(extension => extension.id)).size !== metadata.extensions.length) context.addIssue({ code: "custom", message: "Use a unique ID for each additional mission." }); });
export const worldContentDraftSchema = z.object({ missionId: z.string().refine(id => missions.some(m => m.id === id)), title: teachingText(3, 100), objective: teachingText(15, 1200), dialogue: teachingText(5, 600), metadata: worldContentMetadataSchema.optional() }).strict();
export const studioActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft"), content: worldContentDraftSchema }).strict(),
  z.object({ type: z.enum(["submit", "approve", "publish"]), id: z.string().min(1).max(100) }).strict(),
]);
export function publicationTransition(status: string, action: "submit" | "approve" | "publish", creator: string, actor: string, publicationEnabled: boolean) {
  if (action === "submit" && status === "draft") return "review";
  if (action === "approve" && status === "review" && creator !== actor) return "approved";
  if (action === "publish" && status === "approved" && creator !== actor && publicationEnabled) return "published";
  throw new ContentReviewError(action === "publish" && !publicationEnabled ? "Practice content publication is disabled until separately enabled for this environment." : "This version needs the preceding review step and an independent content approver.");
}

export function assertWorldPackConflicts(metadata: z.infer<typeof worldContentMetadataSchema>, others: z.infer<typeof worldContentMetadataSchema>[]) {
  const extensionIds = new Set(others.flatMap(pack => pack.extensions.map(extension => extension.id)));
  const mappings = new Set(others.flatMap(pack => pack.curriculumLinks.map(link => `${link.kind}:${link.id}`)));
  if (metadata.extensions.some(extension => extensionIds.has(extension.id))) throw new ContentReviewError("An additional mission ID is already published in another content pack.");
  if (metadata.curriculumLinks.some(link => mappings.has(`${link.kind}:${link.id}`))) throw new ContentReviewError("A lesson already has a published world mapping. Review a new version of its current content pack before moving it.");
}
